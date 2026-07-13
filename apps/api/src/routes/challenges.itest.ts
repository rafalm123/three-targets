import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localDateInTimeZone } from '../lib/day-boundary';
import { prisma } from '../lib/prisma';
import { buildServer } from '../server';

// Integracja API ↔ DB (realny Postgres). Świeży user per test → izolacja stanu.
let app: FastifyInstance;

beforeAll(async () => {
  app = buildServer({ logger: false });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

const TZ = 'Europe/Warsaw';

async function signUpWithId(): Promise<{ cookie: string; userId: string }> {
  const email = `it-ch-${randomUUID()}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
    payload: { email, password: 'Passw0rd!23', name: 'IT User', timezone: TZ },
  });
  if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
  const cookie = raw
    .map((c) => c.split(';')[0] ?? '')
    .filter(Boolean)
    .join('; ');
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { cookie, userId: user.id };
}

function createChallengeReq(cookie: string, body: unknown) {
  return app.inject({
    method: 'POST',
    url: '/api/challenges',
    headers: { cookie, 'content-type': 'application/json' },
    payload: body as Record<string, unknown>,
  });
}

function getActive(cookie: string) {
  return app.inject({ method: 'GET', url: '/api/challenges/active', headers: { cookie } });
}

/** Tworzy wpis poranny „dziś" i zwraca cele. */
async function createMorning(cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/days',
    headers: { cookie, 'content-type': 'application/json' },
    payload: { main: { title: 'Główny' }, secondary: [{ title: 'A' }, { title: 'B' }] },
  });
  if (res.statusCode !== 201) throw new Error(`morning failed: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string; goals: { id: string; kind: string }[] };
}

/** Wieczorne odznaczenie „dziś": poboczne dostają `secDone`, główny zawsze true. */
async function submitEvening(
  cookie: string,
  goals: { id: string; kind: string }[],
  secDone: [boolean, boolean],
) {
  const sec = goals.filter((g) => g.kind === 'secondary');
  const main = goals.find((g) => g.kind === 'main');
  if (!main || sec.length !== 2) throw new Error('oczekiwano 1 głównego + 2 pobocznych');
  const s0 = sec[0];
  const s1 = sec[1];
  if (!s0 || !s1) throw new Error('brak pobocznych');
  return app.inject({
    method: 'POST',
    url: '/api/days/today/evening',
    headers: { cookie, 'content-type': 'application/json' },
    payload: {
      goals: [
        { id: main.id, completed: true },
        { id: s0.id, completed: secDone[0] },
        { id: s1.id, completed: secDone[1] },
      ],
    },
  });
}

const TIERS = [
  { threshold: 10, reward: 'Kino' },
  { threshold: 20, reward: 'Kolacja' },
];

describe('POST /api/challenges (create) + GET active', () => {
  it('gość bez sesji → 401', async () => {
    const res = await createChallengeReq('', { tiers: TIERS });
    expect(res.statusCode).toBe(401);
  });

  it('happy path: create → 201 ChallengeWithPoints; startDate=dziś, endDate=+29 dni', async () => {
    const { cookie } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const res = await createChallengeReq(cookie, { title: 'Lipiec', tiers: TIERS });
    expect(res.statusCode).toBe(201);
    const ch = res.json();
    expect(ch.title).toBe('Lipiec');
    expect(ch.startDate).toBe(today);
    // endDate = start + 29 dni
    const end = new Date(`${today}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 29);
    expect(ch.endDate).toBe(end.toISOString().slice(0, 10));
    expect(ch.totalPoints).toBe(0);
    expect(ch.nextThreshold).toBe(10);
    expect(ch.pointsToNext).toBe(10);
    expect(ch.tiers).toEqual([
      { threshold: 10, reward: 'Kino', unlocked: false },
      { threshold: 20, reward: 'Kolacja', unlocked: false },
    ]);
    expect(typeof ch.createdAt).toBe('string');
  });

  it('GET active zwraca aktywne wyzwanie usera', async () => {
    const { cookie } = await signUpWithId();
    await createChallengeReq(cookie, { tiers: TIERS });
    const res = await getActive(cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().challenge).not.toBeNull();
    expect(res.json().challenge.title).toBeNull();
  });

  it('GET active bez żadnego wyzwania → { challenge: null }', async () => {
    const { cookie } = await signUpWithId();
    const res = await getActive(cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().challenge).toBeNull();
  });

  it('409 gdy istnieje już AKTYWNA lista', async () => {
    const { cookie } = await signUpWithId();
    const first = await createChallengeReq(cookie, { tiers: TIERS });
    expect(first.statusCode).toBe(201);
    const second = await createChallengeReq(cookie, { tiers: TIERS });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('ACTIVE_CHALLENGE_EXISTS');
  });

  it('odrzuca progi malejące (walidacja kontraktu) → 400', async () => {
    const { cookie } = await signUpWithId();
    const res = await createChallengeReq(cookie, {
      tiers: [
        { threshold: 20, reward: 'B' },
        { threshold: 10, reward: 'A' },
      ],
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Liczenie punktów przez publiczne API (create → zamknij dzień → active)', () => {
  it('dzień z 2 pobocznymi completed → totalPoints 2', async () => {
    const { cookie } = await signUpWithId();
    await createChallengeReq(cookie, { tiers: TIERS });
    const day = await createMorning(cookie);
    const close = await submitEvening(cookie, day.goals, [true, true]);
    expect(close.statusCode).toBe(200);

    const active = (await getActive(cookie)).json().challenge;
    expect(active.totalPoints).toBe(2);
    expect(active.pointsToNext).toBe(8); // do progu 10
    expect(active.tiers.every((t: { unlocked: boolean }) => !t.unlocked)).toBe(true);
  });

  it('główny completed nie dodaje; tylko 1 poboczny → totalPoints 1', async () => {
    const { cookie } = await signUpWithId();
    await createChallengeReq(cookie, { tiers: TIERS });
    const day = await createMorning(cookie);
    const close = await submitEvening(cookie, day.goals, [true, false]);
    expect(close.statusCode).toBe(200);

    const active = (await getActive(cookie)).json().challenge;
    expect(active.totalPoints).toBe(1);
  });

  it('próg odblokowany dokładnie przy równości (seed 5 dni × 2 poboczne = 10 pkt)', async () => {
    const { cookie, userId } = await signUpWithId();
    const created = (await createChallengeReq(cookie, { tiers: TIERS })).json();

    // Przesuwamy start wyzwania 5 dni wstecz, by dni [start .. dziś] mieściły się w oknie i były ≤ dziś.
    const today = localDateInTimeZone(new Date(), TZ);
    const newStart = new Date(`${today}T00:00:00.000Z`);
    newStart.setUTCDate(newStart.getUTCDate() - 5);
    await prisma.challenge.update({
      where: { id: created.id },
      data: { startDate: newStart }, // endDate nadal w przyszłości → wyzwanie aktywne
    });

    // 5 dni closed (dziś-1 .. dziś-5), każdy 2 poboczne completed = 10 pkt (główny nie liczy).
    for (let i = 1; i <= 5; i++) {
      const d = new Date(`${today}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - i);
      await prisma.day.create({
        data: {
          userId,
          date: d,
          status: 'closed',
          goals: {
            create: [
              { kind: 'main', position: 0, title: 'G', completed: true },
              { kind: 'secondary', position: 1, title: 'A', completed: true },
              { kind: 'secondary', position: 2, title: 'B', completed: true },
            ],
          },
        },
      });
    }

    const active = (await getActive(cookie)).json().challenge;
    expect(active.totalPoints).toBe(10);
    // próg 10 odblokowany DOKŁADNIE przy równości; próg 20 nadal zablokowany
    expect(active.tiers).toEqual([
      { threshold: 10, reward: 'Kino', unlocked: true },
      { threshold: 20, reward: 'Kolacja', unlocked: false },
    ]);
    expect(active.nextThreshold).toBe(20);
    expect(active.pointsToNext).toBe(10);
  });
});

describe('GET /api/challenges (historia) + GET :id', () => {
  it('historia pokazuje zakończone wyzwania (endDate < dziś), od najnowszych', async () => {
    const { cookie, userId } = await signUpWithId();
    // Seed dwóch zakończonych wyzwań bezpośrednio w DB (endDate w przeszłości).
    await prisma.challenge.create({
      data: {
        userId,
        title: 'Stare-1',
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        endDate: new Date('2020-01-30T00:00:00.000Z'),
        rewardTiers: { create: [{ threshold: 10, reward: 'A' }] },
      },
    });
    await prisma.challenge.create({
      data: {
        userId,
        title: 'Stare-2',
        startDate: new Date('2021-06-01T00:00:00.000Z'),
        endDate: new Date('2021-06-30T00:00:00.000Z'),
        rewardTiers: { create: [{ threshold: 10, reward: 'A' }] },
      },
    });

    const res = await app.inject({ method: 'GET', url: '/api/challenges', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as { title: string; totalPoints: number }[];
    expect(items).toHaveLength(2);
    expect(items[0]?.title).toBe('Stare-2'); // najnowsze (startDate desc)
    expect(items[1]?.title).toBe('Stare-1');
    expect(items[0]?.totalPoints).toBe(0); // brak dni w oknie
  });

  it('aktywne wyzwanie NIE pojawia się w historii', async () => {
    const { cookie } = await signUpWithId();
    await createChallengeReq(cookie, { tiers: TIERS });
    const res = await app.inject({ method: 'GET', url: '/api/challenges', headers: { cookie } });
    expect(res.json().items).toHaveLength(0);
  });

  it('GET :id zwraca własne wyzwanie; cudze → null', async () => {
    const owner = await signUpWithId();
    const created = (await createChallengeReq(owner.cookie, { tiers: TIERS })).json();

    const mine = await app.inject({
      method: 'GET',
      url: `/api/challenges/${created.id}`,
      headers: { cookie: owner.cookie },
    });
    expect(mine.json().challenge?.id).toBe(created.id);

    const other = await signUpWithId();
    const foreign = await app.inject({
      method: 'GET',
      url: `/api/challenges/${created.id}`,
      headers: { cookie: other.cookie },
    });
    expect(foreign.statusCode).toBe(200);
    expect(foreign.json().challenge).toBeNull();
  });
});

describe('PATCH /api/challenges/:id (edycja aktywnej)', () => {
  it('gość → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/challenges/x',
      headers: { 'content-type': 'application/json' },
      payload: { tiers: TIERS },
    });
    expect(res.statusCode).toBe(401);
  });

  it('edytuje tytuł i progi aktywnej listy → 200 z nowymi progami', async () => {
    const { cookie } = await signUpWithId();
    const created = (await createChallengeReq(cookie, { title: 'Stary', tiers: TIERS })).json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/challenges/${created.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { title: 'Nowy', tiers: [{ threshold: 30, reward: 'Wyjazd' }] },
    });
    expect(res.statusCode).toBe(200);
    const ch = res.json();
    expect(ch.title).toBe('Nowy');
    expect(ch.tiers).toEqual([{ threshold: 30, reward: 'Wyjazd', unlocked: false }]);
    expect(ch.nextThreshold).toBe(30);
  });

  // CR MAJOR 1 — tri-state tytułu: PATCH samym { tiers } NIE rusza istniejącego tytułu.
  it('PATCH { tiers } (bez title) NIE zmienia tytułu', async () => {
    const { cookie } = await signUpWithId();
    const created = (await createChallengeReq(cookie, { title: 'Trzymaj', tiers: TIERS })).json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/challenges/${created.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { tiers: [{ threshold: 30, reward: 'X' }] }, // brak title
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('Trzymaj'); // tytuł nietknięty
    // sanity przez GET
    const fetched = await app.inject({
      method: 'GET',
      url: `/api/challenges/${created.id}`,
      headers: { cookie },
    });
    expect(fetched.json().challenge.title).toBe('Trzymaj');
  });

  // CR MAJOR 1 — title: null JAWNIE czyści tytuł.
  it('PATCH { title: null } czyści tytuł', async () => {
    const { cookie } = await signUpWithId();
    const created = (await createChallengeReq(cookie, { title: 'DoUsuniecia', tiers: TIERS })).json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/challenges/${created.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { title: null, tiers: TIERS },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBeNull();
  });

  it('PATCH cudzego / zakończonego → 404 CHALLENGE_NOT_EDITABLE', async () => {
    const { cookie, userId } = await signUpWithId();
    // zakończone wyzwanie (endDate w przeszłości) — nieedytowalne
    const ended = await prisma.challenge.create({
      data: {
        userId,
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        endDate: new Date('2020-01-30T00:00:00.000Z'),
        rewardTiers: { create: [{ threshold: 10, reward: 'A' }] },
      },
    });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/challenges/${ended.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { tiers: TIERS },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CHALLENGE_NOT_EDITABLE');
  });
});

// CR MAJOR 2 — wyścig: równoległe POST-y tego samego usera → dokładnie 1 aktywna, reszta 409.
describe('POST /api/challenges — wyścig (inwariant max 1 aktywna)', () => {
  it('5 równoległych POST-ów → dokładnie jeden 201, reszta 409; w DB 1 wyzwanie', async () => {
    const { cookie, userId } = await signUpWithId();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createChallengeReq(cookie, { tiers: TIERS })),
    );
    const codes = results.map((r) => r.statusCode).sort();
    const created = codes.filter((c) => c === 201).length;
    const conflicts = codes.filter((c) => c === 409).length;
    expect(created).toBe(1);
    expect(conflicts).toBe(4);

    const count = await prisma.challenge.count({ where: { userId } });
    expect(count).toBe(1); // inwariant: dokładnie jedno wyzwanie w bazie
  });
});

// CR NIT 11 — istnieje TYLKO zakończone wyzwanie → GET /active zwraca null.
describe('GET /api/challenges/active — tylko zakończone → null', () => {
  it('user ma jedynie zakończone wyzwanie → active = null', async () => {
    const { cookie, userId } = await signUpWithId();
    await prisma.challenge.create({
      data: {
        userId,
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        endDate: new Date('2020-01-30T00:00:00.000Z'),
        rewardTiers: { create: [{ threshold: 10, reward: 'A' }] },
      },
    });
    const res = await getActive(cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().challenge).toBeNull();
  });
});

// CR MINOR 5 — izolacja PUNKTÓW między userami (najważniejszy guard regresji).
describe('Izolacja punktów między userami', () => {
  it('user B zamyka dzień z 2 pobocznymi; aktywne wyzwanie usera A nadal totalPoints=0', async () => {
    const a = await signUpWithId();
    const b = await signUpWithId();

    // A ma aktywne wyzwanie, ale żadnych własnych dni.
    await createChallengeReq(a.cookie, { tiers: TIERS });

    // B zamyka dzień z 2 pobocznymi completed (2 pkt) — nie może wpłynąć na A.
    const dayB = await createMorning(b.cookie);
    const closeB = await submitEvening(b.cookie, dayB.goals, [true, true]);
    expect(closeB.statusCode).toBe(200);

    const activeA = (await getActive(a.cookie)).json().challenge;
    expect(activeA.totalPoints).toBe(0); // punkty B nie przeciekają do A
  });
});
