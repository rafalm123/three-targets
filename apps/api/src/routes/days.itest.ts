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
