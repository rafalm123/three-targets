import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDaysIso, localDateInTimeZone } from '../lib/day-boundary';
import { prisma } from '../lib/prisma';
import { buildServer } from '../server';

// Test integracyjny — uderza w REALNY Postgres (lokalnie: docker-compose; CI: service container).
// Każdy test tworzy własnego usera (unikatowy email) → brak kolizji stanu między testami.
let app: FastifyInstance;

beforeAll(async () => {
  app = buildServer({ logger: false });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});

/** Rejestruje świeżego usera; zwraca ciasteczko sesji i jego id (do bezpośredniego seedowania w DB). */
async function signUpWithId(): Promise<{ cookie: string; userId: string }> {
  const email = `it-${randomUUID()}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
    payload: { email, password: 'Passw0rd!23', name: 'IT User', timezone: 'Europe/Warsaw' },
  });
  if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
  // Tylko pary name=value (bez atrybutów Set-Cookie: Path/HttpOnly/SameSite/Max-Age).
  const cookie = raw
    .map((c) => c.split(';')[0] ?? '')
    .filter(Boolean)
    .join('; ');
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { cookie, userId: user.id };
}

/** Rejestruje świeżego usera i zwraca samo ciasteczko sesji. */
async function signUp(): Promise<string> {
  return (await signUpWithId()).cookie;
}

/** Seeduje dzień o dowolnej dacie (API nie umie backdate'ować) — do testów historii. */
async function seedDay(
  userId: string,
  dateStr: string,
  opts: {
    status?: 'closed' | 'evening_pending';
    mainTitle?: string;
    completed?: [boolean | null, boolean | null, boolean | null];
  } = {},
): Promise<void> {
  const { status = 'closed', mainTitle = 'Główny', completed = [true, false, true] } = opts;
  await prisma.day.create({
    data: {
      userId,
      date: new Date(`${dateStr}T00:00:00.000Z`),
      status,
      eveningNote: status === 'closed' ? 'wieczór' : null,
      goals: {
        create: [
          { kind: 'main', position: 0, title: mainTitle, completed: completed[0] },
          { kind: 'secondary', position: 1, title: 'A', completed: completed[1] },
          { kind: 'secondary', position: 2, title: 'B', completed: completed[2] },
        ],
      },
    },
  });
}

/** Seeduje dzień o dowolnej dacie i zwraca id celów (main + 2 secondary) — do testów okna łaski. */
async function seedDayWithGoals(
  userId: string,
  dateStr: string,
  status: 'closed' | 'evening_pending',
): Promise<{ mainId: string; secIds: [string, string] }> {
  const day = await prisma.day.create({
    data: {
      userId,
      date: new Date(`${dateStr}T00:00:00.000Z`),
      status,
      eveningNote: status === 'closed' ? 'wieczór' : null,
      goals: {
        create: [
          { kind: 'main', position: 0, title: 'Główny', completed: null },
          { kind: 'secondary', position: 1, title: 'A', completed: null },
          { kind: 'secondary', position: 2, title: 'B', completed: null },
        ],
      },
    },
    include: { goals: { orderBy: { position: 'asc' } } },
  });
  const [main, s1, s2] = day.goals;
  if (!main || !s1 || !s2) throw new Error('seed: oczekiwano 3 celów');
  return { mainId: main.id, secIds: [s1.id, s2.id] };
}

const entry = { main: { title: 'Główny' }, secondary: [{ title: 'A' }, { title: 'B' }] };

/** Tworzy wpis poranny i zwraca dzień z 201 (z id celów). */
async function createMorning(cookie: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/days',
    headers: { cookie, 'content-type': 'application/json' },
    payload: entry,
  });
  if (res.statusCode !== 201) throw new Error(`morning failed: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string; goals: { id: string }[] };
}

describe('POST /api/days (integracja API ↔ DB)', () => {
  it('gość bez sesji → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/days',
      headers: { 'content-type': 'application/json' },
      payload: entry,
    });
    expect(res.statusCode).toBe(401);
  });

  it('wpis poranny → 201, dzień evening_pending z 3 celami', async () => {
    const cookie = await signUp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/days',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { ...entry, morningNote: 'dzień dobry' },
    });
    expect(res.statusCode).toBe(201);
    const day = res.json();
    expect(day.status).toBe('evening_pending');
    expect(day.goals).toHaveLength(3);
    expect(day.goals.map((g: { kind: string }) => g.kind)).toEqual(['main', 'secondary', 'secondary']);
    expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('drugi wpis na dziś (ten sam user) → 409', async () => {
    const cookie = await signUp();
    const first = await app.inject({ method: 'POST', url: '/api/days', headers: { cookie, 'content-type': 'application/json' }, payload: entry });
    expect(first.statusCode).toBe(201);
    const dup = await app.inject({ method: 'POST', url: '/api/days', headers: { cookie, 'content-type': 'application/json' }, payload: entry });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('DAY_ALREADY_EXISTS');
  });

  it('zła liczba pobocznych → 400', async () => {
    const cookie = await signUp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/days',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { main: { title: 'G' }, secondary: [{ title: 'A' }] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/days/today (integracja API ↔ DB)', () => {
  it('gość bez sesji → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/days/today' });
    expect(res.statusCode).toBe(401);
  });

  it('przed wpisem porannym → 200 { day: null }', async () => {
    const cookie = await signUp();
    const res = await app.inject({ method: 'GET', url: '/api/days/today', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().day).toBeNull();
  });

  it('po wpisie porannym → 200, dzień z 3 celami', async () => {
    const cookie = await signUp();
    await app.inject({
      method: 'POST',
      url: '/api/days',
      headers: { cookie, 'content-type': 'application/json' },
      payload: entry,
    });
    const res = await app.inject({ method: 'GET', url: '/api/days/today', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const day = res.json().day;
    expect(day).not.toBeNull();
    expect(day.status).toBe('evening_pending');
    expect(day.goals).toHaveLength(3);
  });
});

describe('POST /api/days/today/evening (integracja API ↔ DB)', () => {
  it('gość bez sesji → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { 'content-type': 'application/json' },
      payload: { goals: [{ id: 'a', completed: true }, { id: 'b', completed: false }, { id: 'c', completed: true }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('brak wpisu porannego → 404 NO_DAY_TODAY', async () => {
    const cookie = await signUp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: [{ id: 'a', completed: true }, { id: 'b', completed: false }, { id: 'c', completed: true }] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NO_DAY_TODAY');
  });

  it('odznaczenie 3 celów → 200, dzień closed z zapisanymi wynikami', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const [g1, g2, g3] = day.goals;
    if (!g1 || !g2 || !g3) throw new Error('oczekiwano 3 celów');
    const res = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        goals: [
          { id: g1.id, completed: true, completedNote: 'dowiezione' },
          { id: g2.id, completed: false },
          { id: g3.id, completed: true },
        ],
        eveningNote: 'dobry dzień',
      },
    });
    expect(res.statusCode).toBe(200);
    const closed = res.json();
    expect(closed.status).toBe('closed');
    expect(closed.eveningNote).toBe('dobry dzień');
    const byId = Object.fromEntries(closed.goals.map((g: { id: string }) => [g.id, g]));
    expect(byId[g1.id].completed).toBe(true);
    expect(byId[g1.id].completedNote).toBe('dowiezione');
    expect(byId[g2.id].completed).toBe(false);
    expect(byId[g3.id].completed).toBe(true);
  });

  // BE-19 — dzień „dziś" jest re-submitowalny po zamknięciu (mutowalność po dacie).
  it('re-submit wieczoru dzisiejszego zamkniętego dnia → 200, nowe wyniki nadpisane', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const [g1, g2, g3] = day.goals;
    if (!g1 || !g2 || !g3) throw new Error('oczekiwano 3 celów');
    const first = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: [{ id: g1.id, completed: true }, { id: g2.id, completed: true }, { id: g3.id, completed: true }], eveningNote: 'pierwotny' },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('closed');
    // ponowny submit tego samego (dzisiejszego) dnia — zmienia wyniki i notatkę
    const again = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: [{ id: g1.id, completed: false }, { id: g2.id, completed: false }, { id: g3.id, completed: true }], eveningNote: 'poprawiony' },
    });
    expect(again.statusCode).toBe(200);
    const closed = again.json();
    expect(closed.status).toBe('closed');
    expect(closed.eveningNote).toBe('poprawiony');
    const byId = Object.fromEntries(closed.goals.map((g: { id: string }) => [g.id, g]));
    expect(byId[g1.id].completed).toBe(false);
    expect(byId[g3.id].completed).toBe(true);
  });

  it('podzbiór oznaczeń (mniej niż 3) → 200, closed; nieoznaczone cele bez zmian', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const [g1, g2, g3] = day.goals;
    if (!g1 || !g2 || !g3) throw new Error('oczekiwano 3 celów');
    const res = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: [{ id: g1.id, completed: true }], eveningNote: 'tylko główny' },
    });
    expect(res.statusCode).toBe(200);
    const closed = res.json();
    expect(closed.status).toBe('closed');
    const byId = Object.fromEntries(closed.goals.map((g: { id: string }) => [g.id, g]));
    expect(byId[g1.id].completed).toBe(true);
    expect(byId[g2.id].completed).toBeNull();
    expect(byId[g3.id].completed).toBeNull();
  });

  it('domknięcie bez oznaczeń → 200, closed; wszystkie cele pozostają null', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const res = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: [], eveningNote: 'koniec dnia' },
    });
    expect(res.statusCode).toBe(200);
    const closed = res.json();
    expect(closed.status).toBe('closed');
    expect(closed.goals.every((g: { completed: boolean | null }) => g.completed === null)).toBe(true);
    void day;
  });

  it('oznaczenie zawierające id spoza dnia → 400 GOAL_NOT_IN_DAY', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const [g1] = day.goals;
    if (!g1) throw new Error('oczekiwano celu');
    const res = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: [{ id: g1.id, completed: true }, { id: 'obce-id', completed: true }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('GOAL_NOT_IN_DAY');
  });

  it('cross-user: id celów innego usera → 400, własny dzień zostaje otwarty', async () => {
    const cookieA = await signUp();
    const dayA = await createMorning(cookieA);
    const cookieB = await signUp();
    await createMorning(cookieB); // B ma własny dzień (evening_pending) — więc nie 404, tylko 400
    const res = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie: cookieB, 'content-type': 'application/json' },
      payload: { goals: dayA.goals.map((g) => ({ id: g.id, completed: true })) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('GOAL_NOT_IN_DAY');
    const check = await app.inject({ method: 'GET', url: '/api/days/today', headers: { cookie: cookieB } });
    expect(check.json().day.status).toBe('evening_pending');
  });
});

describe('PATCH /api/days/today (edycja poranna — integracja API ↔ DB)', () => {
  it('gość bez sesji → 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/days/today',
      headers: { 'content-type': 'application/json' },
      payload: entry,
    });
    expect(res.statusCode).toBe(401);
  });

  it('brak wpisu porannego → 404 NO_DAY_TODAY', async () => {
    const cookie = await signUp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/days/today',
      headers: { cookie, 'content-type': 'application/json' },
      payload: entry,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NO_DAY_TODAY');
  });

  it('edycja evening_pending → 200, treść poranna nadpisana, status bez zmian', async () => {
    const cookie = await signUp();
    await createMorning(cookie);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/days/today',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        main: { title: 'Nowy główny', note: 'notka' },
        secondary: [{ title: 'Nowy A' }, { title: 'Nowy B' }],
        morningNote: 'zmienione rano',
      },
    });
    expect(res.statusCode).toBe(200);
    const day = res.json();
    expect(day.status).toBe('evening_pending');
    expect(day.morningNote).toBe('zmienione rano');
    const main = day.goals.find((g: { kind: string }) => g.kind === 'main');
    expect(main.title).toBe('Nowy główny');
    expect(main.note).toBe('notka');
    expect(day.goals.filter((g: { kind: string }) => g.kind === 'secondary').map((g: { title: string }) => g.title)).toEqual([
      'Nowy A',
      'Nowy B',
    ]);
  });

  // BE-19 — edycja poranna dzisiejszego dnia działa także PO zamknięciu (mutowalność po dacie).
  it('edycja poranna dzisiejszego zamkniętego dnia → 200 (dziś edytowalny mimo closed)', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const close = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: day.goals.map((g) => ({ id: g.id, completed: true })) },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().status).toBe('closed');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/days/today',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { main: { title: 'Poprawiony główny' }, secondary: [{ title: 'A2' }, { title: 'B2' }], morningNote: 'edycja po zamknięciu' },
    });
    expect(res.statusCode).toBe(200);
    const edited = res.json();
    expect(edited.status).toBe('closed'); // edycja poranna nie zmienia statusu
    expect(edited.morningNote).toBe('edycja po zamknięciu');
    expect(edited.goals.find((g: { kind: string }) => g.kind === 'main').title).toBe('Poprawiony główny');
  });

  // BE-19 — przeszłość ZAMROŻONA: endpointy mutacji ładują tylko „dziś", więc dzień przeszły jest
  // nieosiągalny. Seed przeszłego dnia (otwartego) nie ma dziś rekordu → PATCH/evening „dziś" → 404,
  // a przeszły dzień pozostaje nietknięty.
  it('dzień przeszły nietykalny: brak dnia „dziś" → mutacje 404, przeszły bez zmian', async () => {
    const { cookie, userId } = await signUpWithId();
    await seedDay(userId, '2021-04-01', { status: 'evening_pending', mainTitle: 'Przeszły otwarty', completed: [null, null, null] });

    const patch = await app.inject({ method: 'PATCH', url: '/api/days/today', headers: { cookie, 'content-type': 'application/json' }, payload: entry });
    expect(patch.statusCode).toBe(404);
    expect(patch.json().error.code).toBe('NO_DAY_TODAY');

    const evening = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: [{ id: 'x', completed: true }, { id: 'y', completed: true }, { id: 'z', completed: true }] },
    });
    expect(evening.statusCode).toBe(404);

    // przeszły dzień nadal otwarty i nietknięty
    const past = await app.inject({ method: 'GET', url: '/api/days/2021-04-01', headers: { cookie } });
    expect(past.json().day.status).toBe('evening_pending');
    expect(past.json().day.goals.find((g: { kind: string }) => g.kind === 'main').title).toBe('Przeszły otwarty');
  });

  it('replace (nie merge): PATCH bez pól opcjonalnych czyści morningNote i note celów do null', async () => {
    const cookie = await signUp();
    // dzień z wypełnionymi notatkami…
    await app.inject({
      method: 'POST',
      url: '/api/days',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        main: { title: 'G', note: 'nota głównego' },
        secondary: [{ title: 'A', note: 'nota A' }, { title: 'B' }],
        morningNote: 'nota poranna',
      },
    });
    // …edycja BEZ morningNote i BEZ note → pełne zastąpienie zeruje pominięte pola
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/days/today',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { main: { title: 'G2' }, secondary: [{ title: 'A2' }, { title: 'B2' }] },
    });
    expect(res.statusCode).toBe(200);
    const day = res.json();
    expect(day.morningNote).toBeNull();
    const main = day.goals.find((g: { kind: string }) => g.kind === 'main');
    expect(main.note).toBeNull();
    expect(main.title).toBe('G2');
  });
});

describe('GET /api/days/history (integracja API ↔ DB)', () => {
  it('gość bez sesji → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/days/history' });
    expect(res.statusCode).toBe(401);
  });

  it('brak dni → 200 { items: [], nextCursor: null }', async () => {
    const cookie = await signUp();
    const res = await app.inject({ method: 'GET', url: '/api/days/history', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], nextCursor: null });
  });

  it('przeszłe dni od najnowszych; podsumowanie bez pełnych notatek', async () => {
    const { cookie, userId } = await signUpWithId();
    await seedDay(userId, '2020-01-01', { mainTitle: 'Dzień 1', completed: [true, true, true] });
    await seedDay(userId, '2020-01-03', {
      mainTitle: 'Dzień 3',
      status: 'evening_pending',
      completed: [false, true, null],
    });
    await seedDay(userId, '2020-01-02', { mainTitle: 'Dzień 2' });

    const res = await app.inject({ method: 'GET', url: '/api/days/history', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { items, nextCursor } = res.json();
    expect(items.map((d: { date: string }) => d.date)).toEqual(['2020-01-03', '2020-01-02', '2020-01-01']);
    expect(nextCursor).toBeNull();

    const first = items[0];
    expect(first.mainTitle).toBe('Dzień 3');
    expect(first.status).toBe('evening_pending');
    expect(first.goalsCompleted).toEqual([false, true, null]);
    // bez pełnych notatek w kształcie podsumowania
    expect(first).not.toHaveProperty('morningNote');
    expect(first).not.toHaveProperty('eveningNote');
    expect(first).not.toHaveProperty('goals');
  });

  it('keyset: limit=2 → nextCursor, druga strona przez ?before=', async () => {
    const { cookie, userId } = await signUpWithId();
    await seedDay(userId, '2019-05-01', { mainTitle: 'A' });
    await seedDay(userId, '2019-05-02', { mainTitle: 'B' });
    await seedDay(userId, '2019-05-03', { mainTitle: 'C' });

    const p1 = await app.inject({ method: 'GET', url: '/api/days/history?limit=2', headers: { cookie } });
    expect(p1.statusCode).toBe(200);
    const page1 = p1.json();
    expect(page1.items.map((d: { date: string }) => d.date)).toEqual(['2019-05-03', '2019-05-02']);
    expect(page1.nextCursor).toBe('2019-05-02');

    const p2 = await app.inject({
      method: 'GET',
      url: `/api/days/history?limit=2&before=${page1.nextCursor}`,
      headers: { cookie },
    });
    const page2 = p2.json();
    expect(page2.items.map((d: { date: string }) => d.date)).toEqual(['2019-05-01']);
    expect(page2.nextCursor).toBeNull();
  });

  it('pełna strona bez nadmiaru (limit == liczba dni) → nextCursor: null', async () => {
    const { cookie, userId } = await signUpWithId();
    await seedDay(userId, '2018-03-01', { mainTitle: 'A' });
    await seedDay(userId, '2018-03-02', { mainTitle: 'B' });
    await seedDay(userId, '2018-03-03', { mainTitle: 'C' });

    const res = await app.inject({ method: 'GET', url: '/api/days/history?limit=3', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const { items, nextCursor } = res.json();
    expect(items).toHaveLength(3);
    expect(nextCursor).toBeNull();
  });

  it('dzisiejszy dzień wykluczony z historii', async () => {
    const { cookie, userId } = await signUpWithId();
    await createMorning(cookie); // dzień „dzisiaj" (evening_pending)
    await seedDay(userId, '2020-06-01', { mainTitle: 'Przeszły' });

    const res = await app.inject({ method: 'GET', url: '/api/days/history', headers: { cookie } });
    const { items } = res.json();
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2020-06-01');
  });
});

describe('GET /api/days/:date (szczegóły dnia po dacie — integracja API ↔ DB)', () => {
  it('gość bez sesji → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/days/2020-01-01' });
    expect(res.statusCode).toBe(401);
  });

  it('niepoprawna data kalendarzowa (2020-02-31) → 400', async () => {
    const cookie = await signUp();
    const res = await app.inject({ method: 'GET', url: '/api/days/2020-02-31', headers: { cookie } });
    expect(res.statusCode).toBe(400);
  });

  it('data z przyszłości → 400 FUTURE_DATE', async () => {
    const cookie = await signUp();
    const tomorrow = addDaysIso(localDateInTimeZone(new Date(), 'Europe/Warsaw'), 1);
    const res = await app.inject({ method: 'GET', url: `/api/days/${tomorrow}`, headers: { cookie } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('FUTURE_DATE');
  });

  it('przeszła data bez wpisu → 200 { day: null }', async () => {
    const cookie = await signUp();
    const res = await app.inject({ method: 'GET', url: '/api/days/2019-09-09', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().day).toBeNull();
  });

  it('przeszła data z wpisem → 200, pełny dzień z notatkami i celami (nie okrojony)', async () => {
    const { cookie, userId } = await signUpWithId();
    // Seed wprost z pełnymi notatkami — dowód, że BE-17 zwraca treść, której historia (BE-14) nie ma.
    await prisma.day.create({
      data: {
        userId,
        date: new Date('2020-06-01T00:00:00.000Z'),
        status: 'closed',
        morningNote: 'poranna notatka',
        eveningNote: 'wieczorna notatka',
        goals: {
          create: [
            { kind: 'main', position: 0, title: 'Historyczny', note: 'nota celu', completed: true, completedNote: 'dowiezione' },
            { kind: 'secondary', position: 1, title: 'A', completed: false },
            { kind: 'secondary', position: 2, title: 'B', completed: true },
          ],
        },
      },
    });
    const res = await app.inject({ method: 'GET', url: '/api/days/2020-06-01', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const day = res.json().day;
    expect(day).not.toBeNull();
    expect(day.date).toBe('2020-06-01');
    expect(day.status).toBe('closed');
    expect(day.morningNote).toBe('poranna notatka');
    expect(day.eveningNote).toBe('wieczorna notatka');
    expect(day.goals).toHaveLength(3);
    const main = day.goals.find((g: { kind: string }) => g.kind === 'main');
    expect(main.note).toBe('nota celu');
    expect(main.completed).toBe(true);
    expect(main.completedNote).toBe('dowiezione');
  });

  it('dzisiejsza data → 200, dzień „dzisiaj"', async () => {
    const cookie = await signUp();
    await createMorning(cookie);
    const today = localDateInTimeZone(new Date(), 'Europe/Warsaw');
    const res = await app.inject({ method: 'GET', url: `/api/days/${today}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().day.status).toBe('evening_pending');
  });
});

describe('PATCH /api/days/:date/goals/:goalId (oznaczanie per-cel — integracja API ↔ DB)', () => {
  const TZ = 'Europe/Warsaw';

  it('gość bez sesji → 401', async () => {
    const today = localDateInTimeZone(new Date(), TZ);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${today}/goals/x`,
      headers: { 'content-type': 'application/json' },
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(401);
  });

  it('oznaczenie celu dziś → 200, completed zapisany, status bez zmian', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const [g1] = day.goals;
    if (!g1) throw new Error('oczekiwano celu');
    const today = localDateInTimeZone(new Date(), TZ);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${today}/goals/${g1.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { completed: true, completedNote: 'zrobione' },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json();
    expect(updated.status).toBe('evening_pending');
    const g = updated.goals.find((x: { id: string }) => x.id === g1.id);
    expect(g.completed).toBe(true);
    expect(g.completedNote).toBe('zrobione');
  });

  it('oznaczenie celu wczoraj (evening_pending) → 200', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const yesterday = addDaysIso(today, -1);
    const { mainId } = await seedDayWithGoals(userId, yesterday, 'evening_pending');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${yesterday}/goals/${mainId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().goals.find((g: { id: string }) => g.id === mainId).completed).toBe(true);
  });

  it('oznaczenie celu wczoraj (closed) → 403 DAY_FROZEN', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const yesterday = addDaysIso(today, -1);
    const { mainId } = await seedDayWithGoals(userId, yesterday, 'closed');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${yesterday}/goals/${mainId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('DAY_FROZEN');
  });

  it('oznaczenie celu przedwczoraj → 403 DAY_FROZEN (nawet gdy pending)', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const dayBefore = addDaysIso(today, -2);
    const { mainId } = await seedDayWithGoals(userId, dayBefore, 'evening_pending');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${dayBefore}/goals/${mainId}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('DAY_FROZEN');
  });

  it('cel spoza dnia → 400 GOAL_NOT_IN_DAY', async () => {
    const cookie = await signUp();
    await createMorning(cookie);
    const today = localDateInTimeZone(new Date(), TZ);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${today}/goals/obce-id`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('GOAL_NOT_IN_DAY');
  });

  it('dziś bez wpisu porannego → 404 NO_DAY_TODAY', async () => {
    const cookie = await signUp();
    const today = localDateInTimeZone(new Date(), TZ);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${today}/goals/x`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { completed: true },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NO_DAY_TODAY');
  });

  // NIT-2 (IDOR): user A z PRAWDZIWYM goalId dnia usera B → 400 GOAL_NOT_IN_DAY; cel ofiary bez zmian.
  it('cel innego usera (prawdziwy goalId) → 400 GOAL_NOT_IN_DAY, ofiara bez zmian', async () => {
    const { cookie: cookieB, userId: userIdB } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const { mainId: mainB } = await seedDayWithGoals(userIdB, today, 'evening_pending');
    await prisma.goal.update({ where: { id: mainB }, data: { completed: true, completedNote: 'ofiara' } });

    const cookieA = await signUp();
    await createMorning(cookieA); // A ma własny dzień „dziś" → nie 404, tylko 400
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${today}/goals/${mainB}`,
      headers: { cookie: cookieA, 'content-type': 'application/json' },
      payload: { completed: false, completedNote: 'atak' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('GOAL_NOT_IN_DAY');

    const victim = await prisma.goal.findUniqueOrThrow({ where: { id: mainB } });
    expect(victim.completed).toBe(true);
    expect(victim.completedNote).toBe('ofiara');

    void cookieB;
  });

  // NIT-1 (regresja BE-19): dziś-`closed` NADAL oznaczalny per-cel (brak filtra statusu dla „dziś").
  it('oznaczenie celu dziś po zamknięciu (closed) → 200 (dziś edytowalny)', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const [g1] = day.goals;
    if (!g1) throw new Error('oczekiwano celu');
    const close = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: day.goals.map((g) => ({ id: g.id, completed: true })) },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().status).toBe('closed');

    const today = localDateInTimeZone(new Date(), TZ);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${today}/goals/${g1.id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { completed: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('closed');
    expect(res.json().goals.find((g: { id: string }) => g.id === g1.id).completed).toBe(false);
  });
});

describe('POST /api/days/:date/evening (domknięcie po dacie — okno łaski)', () => {
  const TZ = 'Europe/Warsaw';

  it('zamknięcie wczoraj (evening_pending) → 200, closed + oznaczenia', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const yesterday = addDaysIso(today, -1);
    const { mainId, secIds } = await seedDayWithGoals(userId, yesterday, 'evening_pending');
    const res = await app.inject({
      method: 'POST',
      url: `/api/days/${yesterday}/evening`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        goals: [{ id: mainId, completed: true }, { id: secIds[0], completed: false }],
        eveningNote: 'domknięte wczoraj',
      },
    });
    expect(res.statusCode).toBe(200);
    const closed = res.json();
    expect(closed.status).toBe('closed');
    expect(closed.eveningNote).toBe('domknięte wczoraj');
    const byId = Object.fromEntries(closed.goals.map((g: { id: string }) => [g.id, g]));
    expect(byId[mainId].completed).toBe(true);
    expect(byId[secIds[0]].completed).toBe(false);
    expect(byId[secIds[1]].completed).toBeNull();
  });

  it('zamknięcie wczoraj (już closed) → 403 DAY_FROZEN', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const yesterday = addDaysIso(today, -1);
    const { mainId } = await seedDayWithGoals(userId, yesterday, 'closed');
    const res = await app.inject({
      method: 'POST',
      url: `/api/days/${yesterday}/evening`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: [{ id: mainId, completed: true }] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('DAY_FROZEN');
  });

  it('zamknięcie przedwczoraj → 403 DAY_FROZEN', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const dayBefore = addDaysIso(today, -2);
    const { mainId } = await seedDayWithGoals(userId, dayBefore, 'evening_pending');
    const res = await app.inject({
      method: 'POST',
      url: `/api/days/${dayBefore}/evening`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: [{ id: mainId, completed: true }] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('DAY_FROZEN');
  });
});

describe('PATCH /api/days/:date (edycja poranna po dacie — okno łaski)', () => {
  const TZ = 'Europe/Warsaw';

  it('edycja wczoraj (evening_pending) → 200, treść nadpisana, status bez zmian', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const yesterday = addDaysIso(today, -1);
    await seedDayWithGoals(userId, yesterday, 'evening_pending');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${yesterday}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { main: { title: 'Wczoraj główny' }, secondary: [{ title: 'W-A' }, { title: 'W-B' }], morningNote: 'wczoraj rano' },
    });
    expect(res.statusCode).toBe(200);
    const day = res.json();
    expect(day.status).toBe('evening_pending');
    expect(day.morningNote).toBe('wczoraj rano');
    expect(day.goals.find((g: { kind: string }) => g.kind === 'main').title).toBe('Wczoraj główny');
  });

  it('edycja wczoraj (closed) → 403 DAY_FROZEN', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const yesterday = addDaysIso(today, -1);
    await seedDayWithGoals(userId, yesterday, 'closed');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${yesterday}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: entry,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('DAY_FROZEN');
  });

  it('edycja przedwczoraj → 403 DAY_FROZEN', async () => {
    const { cookie, userId } = await signUpWithId();
    const today = localDateInTimeZone(new Date(), TZ);
    const dayBefore = addDaysIso(today, -2);
    await seedDayWithGoals(userId, dayBefore, 'evening_pending');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${dayBefore}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: entry,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('DAY_FROZEN');
  });

  // NIT-3: data przyszła w mutacji → 400 FUTURE_DATE (spójnie z GET /days/:date), nie mylące DAY_FROZEN.
  it('edycja poranna daty z przyszłości → 400 FUTURE_DATE', async () => {
    const cookie = await signUp();
    const tomorrow = addDaysIso(localDateInTimeZone(new Date(), TZ), 1);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/days/${tomorrow}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: entry,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('FUTURE_DATE');
  });
});
