import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

/** Rejestruje świeżego usera i zwraca ciasteczko sesji (jak z formularza rejestracji). */
async function signUp(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
    payload: {
      email: `it-${randomUUID()}@test.local`,
      password: 'Passw0rd!23',
      name: 'IT User',
      timezone: 'Europe/Warsaw',
    },
  });
  if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
  // Tylko pary name=value (bez atrybutów Set-Cookie: Path/HttpOnly/SameSite/Max-Age).
  return raw
    .map((c) => c.split(';')[0] ?? '')
    .filter(Boolean)
    .join('; ');
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

  it('ponowne zamknięcie zamkniętego dnia → 409 DAY_ALREADY_CLOSED', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const marks = day.goals.map((g) => ({ id: g.id, completed: true }));
    const first = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: marks },
    });
    expect(first.statusCode).toBe(200);
    const again = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { goals: marks },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('DAY_ALREADY_CLOSED');
  });

  it('oznaczenia nie pasujące do celów dnia → 400 GOAL_MISMATCH', async () => {
    const cookie = await signUp();
    const day = await createMorning(cookie);
    const [g1, g2] = day.goals;
    if (!g1 || !g2) throw new Error('oczekiwano celów');
    const res = await app.inject({
      method: 'POST',
      url: '/api/days/today/evening',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        goals: [
          { id: g1.id, completed: true },
          { id: g2.id, completed: true },
          { id: 'obce-id', completed: true },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('GOAL_MISMATCH');
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
    expect(res.json().error.code).toBe('GOAL_MISMATCH');
    const check = await app.inject({ method: 'GET', url: '/api/days/today', headers: { cookie: cookieB } });
    expect(check.json().day.status).toBe('evening_pending');
  });
});
