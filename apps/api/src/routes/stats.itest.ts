import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDaysIso, localDateInTimeZone } from '../lib/day-boundary';
import { prisma } from '../lib/prisma';
import { buildServer } from '../server';

// Integracja API ↔ DB (realny Postgres). Świeży user per test → izolacja stanu.
// UWAGA: „dziś" liczone jest tu (seed) i w endpointcie osobno — teoretycznie krucho, gdyby
// północ Europe/Warsaw wypadła w oknie ~ms między seedem a requestem. Ryzyko pomijalne;
// pełne pokrycie logiki granic jest w streak.test.ts (deterministyczne, bez zależności od zegara).
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
  const email = `it-${randomUUID()}@test.local`;
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

/**
 * Seeduje dzień `closed` o zadanej dacie (`YYYY-MM-DD`).
 * `mainCompleted` (dom. true) = czy cel GŁÓWNY dowieziony — to on decyduje o wliczeniu do serii (BE-18).
 * `secCompleted` = flagi celów pobocznych (bez wpływu na serię — celowo różne od głównego).
 */
async function seedClosed(
  userId: string,
  dateStr: string,
  opts: { mainCompleted?: boolean; secCompleted?: [boolean, boolean] } = {},
): Promise<void> {
  const { mainCompleted = true, secCompleted = [false, true] } = opts;
  await prisma.day.create({
    data: {
      userId,
      date: new Date(`${dateStr}T00:00:00.000Z`),
      status: 'closed',
      eveningNote: 'wieczór',
      goals: {
        create: [
          { kind: 'main', position: 0, title: 'G', completed: mainCompleted },
          { kind: 'secondary', position: 1, title: 'A', completed: secCompleted[0] },
          { kind: 'secondary', position: 2, title: 'B', completed: secCompleted[1] },
        ],
      },
    },
  });
}

async function getStreak(cookie: string) {
  const res = await app.inject({ method: 'GET', url: '/api/stats/streak', headers: { cookie } });
  return res;
}

async function resetStreakReq(cookie: string) {
  return app.inject({ method: 'POST', url: '/api/stats/streak/reset', headers: { cookie } });
}

/** Tworzy wpis poranny „dziś" (1 główny + 2 poboczne) i zwraca dzień z id celów. */
async function createMorning(cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/days',
    headers: { cookie, 'content-type': 'application/json' },
    payload: { main: { title: 'Główny' }, secondary: [{ title: 'A' }, { title: 'B' }] },
  });
  if (res.statusCode !== 201) throw new Error(`morning failed: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string; goals: { id: string }[] };
}

/** Wieczorne odznaczenie „dziś": main dostaje `mainCompleted`, poboczne domyślnie true. */
async function submitEvening(cookie: string, goals: { id: string }[], mainCompleted: boolean) {
  const [g1, g2, g3] = goals;
  if (!g1 || !g2 || !g3) throw new Error('oczekiwano 3 celów');
  return app.inject({
    method: 'POST',
    url: '/api/days/today/evening',
    headers: { cookie, 'content-type': 'application/json' },
    payload: {
      goals: [
        { id: g1.id, completed: mainCompleted },
        { id: g2.id, completed: true },
        { id: g3.id, completed: true },
      ],
    },
  });
}

describe('GET /api/stats/streak (integracja API ↔ DB)', () => {
  it('gość bez sesji → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/stats/streak' });
    expect(res.statusCode).toBe(401);
  });

  it('brak dni → zera + asOfDate = dziś (lokalnie)', async () => {
    const { cookie } = await signUpWithId();
    const res = await getStreak(cookie);
    expect(res.statusCode).toBe(200);
    const s = res.json();
    expect(s).toMatchObject({ current: 0, longest: 0, totalDays: 0 });
    expect(s.asOfDate).toBe(localDateInTimeZone(new Date(), TZ));
  });

  it('dziś + 2 poprzednie closed → current 3, longest 3, totalDays 3', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    await seedClosed(userId, today);
    await seedClosed(userId, addDaysIso(today, -1));
    await seedClosed(userId, addDaysIso(today, -2));
    const s = (await getStreak(cookie)).json();
    expect(s).toMatchObject({ current: 3, longest: 3, totalDays: 3, asOfDate: today });
  });

  it('grace „dziś": dziś bez wpisu, wczoraj+przedwczoraj closed → current 2', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    await seedClosed(userId, addDaysIso(today, -1));
    await seedClosed(userId, addDaysIso(today, -2));
    const s = (await getStreak(cookie)).json();
    expect(s.current).toBe(2);
    expect(s.totalDays).toBe(2);
  });

  it('longest z przeszłości niezależny od bieżącej serii (current 0)', async () => {
    const { cookie, userId } = await signUpWithId();
    await seedClosed(userId, '2020-01-01');
    await seedClosed(userId, '2020-01-02');
    await seedClosed(userId, '2020-01-03');
    const s = (await getStreak(cookie)).json();
    expect(s.longest).toBe(3);
    expect(s.totalDays).toBe(3);
    expect(s.current).toBe(0);
  });

  // BE-18 — seria liczona z celu GŁÓWNEGO: dzień liczy się ⇔ main.completed === true.
  it('dzień closed bez dowiezionego głównego → wykluczony ze WSZYSTKICH metryk', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    // main niedowieziony mimo dowiezionych pobocznych → dzień nie liczy się.
    await seedClosed(userId, today, { mainCompleted: false, secCompleted: [true, true] });
    const s = (await getStreak(cookie)).json();
    expect(s).toMatchObject({ current: 0, longest: 0, totalDays: 0 });
  });

  it('main dowieziony liczy się niezależnie od pobocznych (poboczne oba false)', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    await seedClosed(userId, today, { mainCompleted: true, secCompleted: [false, false] });
    const s = (await getStreak(cookie)).json();
    expect(s).toMatchObject({ current: 1, longest: 1, totalDays: 1 });
  });

  it('przerwa bez dowiezionego głównego łamie current (luka w zbiorze dat)', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    await seedClosed(userId, today, { mainCompleted: true }); // dziś liczy się
    await seedClosed(userId, addDaysIso(today, -1), { mainCompleted: false }); // wczoraj NIE — luka
    await seedClosed(userId, addDaysIso(today, -2), { mainCompleted: true }); // przedwczoraj liczy się
    const s = (await getStreak(cookie)).json();
    expect(s.current).toBe(1); // tylko dziś; wczorajsza luka zrywa serię
    expect(s.totalDays).toBe(2); // dziś + przedwczoraj (wczoraj wykluczony)
  });

  // GRACE (świadome, spójne z BE-19): dziś zamknięty z NIEdowiezionym głównym NIE zrywa jeszcze current —
  // start pętli cofa się do wczoraj (qualifying). „Dziś" jest re-edytowalny do północy (BE-19),
  // więc porażka nie jest ostateczna; seria zrywa się dopiero jutro, jeśli dziś tak zostanie. Pin zachowania.
  it('grace: dziś closed z main.completed=false nie zrywa current (=1, trzyma na wczoraj)', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    await seedClosed(userId, addDaysIso(today, -1), { mainCompleted: true }); // wczoraj qualifying
    await seedClosed(userId, today, { mainCompleted: false }); // dziś closed, ale główny niedowieziony
    const s = (await getStreak(cookie)).json();
    expect(s.current).toBe(1); // wczoraj trzyma; dziś (niequalifying) nie zrywa dzięki grace
    expect(s.totalDays).toBe(1); // liczy się tylko wczoraj
  });
});

// Sedno BE-18 (seria z dowiezionego głównego) × BE-19 (dziś re-edytowalny po zamknięciu) przez PUBLICZNE API.
describe('BE-18 × BE-19 — re-submit „dziś" zmienia serię przez publiczne API', () => {
  it('main=true → streak 1; re-submit main=false → 0; powrót main=true → 1', async () => {
    const { cookie } = await signUpWithId();
    const day = await createMorning(cookie);

    // wieczór z dowiezionym głównym → dzień liczy się do serii
    const close1 = await submitEvening(cookie, day.goals, true);
    expect(close1.statusCode).toBe(200);
    expect((await getStreak(cookie)).json().current).toBe(1);

    // BE-19: re-submit dzisiejszego (zamkniętego) dnia z main=false → dziś przestaje się liczyć
    const close2 = await submitEvening(cookie, day.goals, false);
    expect(close2.statusCode).toBe(200);
    expect((await getStreak(cookie)).json().current).toBe(0);

    // sanity: powrót main=true → znów się liczy
    const close3 = await submitEvening(cookie, day.goals, true);
    expect(close3.statusCode).toBe(200);
    expect((await getStreak(cookie)).json().current).toBe(1);
  });
});

describe('POST /api/stats/streak/reset (BE-20 — ręczny reset serii)', () => {
  it('gość bez sesji → 401', async () => {
    const res = await resetStreakReq('');
    expect(res.statusCode).toBe(401);
  });

  it('reset zeruje current NATYCHMIAST (floor=jutro); longest i totalDays nietknięte', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    await seedClosed(userId, today);
    await seedClosed(userId, addDaysIso(today, -1));
    await seedClosed(userId, addDaysIso(today, -2));

    const before = (await getStreak(cookie)).json();
    expect(before).toMatchObject({ current: 3, longest: 3, totalDays: 3 });

    const reset = await resetStreakReq(cookie);
    expect(reset.statusCode).toBe(200);
    const after = reset.json();
    // floor = JUTRO → current=0 od razu, nawet z dowiezionym dziś głównym (seria startuje od nowa jutro).
    expect(after.current).toBe(0);
    expect(after.longest).toBe(3); // nietknięty
    expect(after.totalDays).toBe(3); // nietknięty
    expect(after.asOfDate).toBe(today);
  });

  it('reset po DOWIEZIONYM dziś głównym też daje current 0 (floor=jutro odcina dziś)', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    await seedClosed(userId, today, { mainCompleted: true });
    expect((await getStreak(cookie)).json().current).toBe(1); // przed resetem dziś się liczy

    const after = (await resetStreakReq(cookie)).json();
    expect(after.current).toBe(0);
    expect(after.longest).toBe(1); // nietknięty
    expect(after.totalDays).toBe(1); // nietknięty
  });

  it('reset gdy dziś bez dowiezionego głównego → current 0', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    // wczoraj + przedwczoraj liczą się, dziś brak wpisu (grace) → przed resetem current 2
    await seedClosed(userId, addDaysIso(today, -1));
    await seedClosed(userId, addDaysIso(today, -2));
    expect((await getStreak(cookie)).json().current).toBe(2);

    const after = (await resetStreakReq(cookie)).json();
    expect(after.current).toBe(0); // floor = jutro, a liczone dni są < jutro
    expect(after.longest).toBe(2);
    expect(after.totalDays).toBe(2);
  });

  it('reset jest trwały: kolejny GET nadal widzi wyzerowany current', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    await seedClosed(userId, today);
    await seedClosed(userId, addDaysIso(today, -1));
    await resetStreakReq(cookie);
    const later = (await getStreak(cookie)).json();
    expect(later.current).toBe(0); // floor (jutro) utrwalony w streakResetDate
    expect(later.longest).toBe(2);
  });
});
