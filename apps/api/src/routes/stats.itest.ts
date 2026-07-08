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

/** Seeduje dzień `closed` o zadanej dacie (`YYYY-MM-DD`). */
async function seedClosed(userId: string, dateStr: string): Promise<void> {
  await prisma.day.create({
    data: {
      userId,
      date: new Date(`${dateStr}T00:00:00.000Z`),
      status: 'closed',
      eveningNote: 'wieczór',
      goals: {
        create: [
          { kind: 'main', position: 0, title: 'G', completed: true },
          { kind: 'secondary', position: 1, title: 'A', completed: false },
          { kind: 'secondary', position: 2, title: 'B', completed: true },
        ],
      },
    },
  });
}

async function getStreak(cookie: string) {
  const res = await app.inject({ method: 'GET', url: '/api/stats/streak', headers: { cookie } });
  return res;
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
});
