import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  createChallenge,
  createDay,
  getActiveChallenge,
  getChallenge,
  getDayByDate,
  getHistory,
  getStreak,
  getToday,
  listChallenges,
  markGoal,
  resetStreak,
  submitEvening,
  updateChallenge,
  updateMorning,
} from './api';
import type {
  ChallengeCreate,
  EveningEntry,
  GoalMarkPatch,
  MorningEntry,
} from '@trzy-cele/shared';

// Mockujemy globalny fetch — testujemy warstwę klienta (koperty, walidacja, mapowanie błędów),
// nie realną sieć.
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const VALID_DAY = {
  id: 'day-1',
  date: '2026-07-09',
  status: 'evening_pending' as const,
  morningNote: null,
  eveningNote: null,
  goals: [],
};

const MORNING_ENTRY: MorningEntry = {
  main: { title: 'Główny cel' },
  secondary: [{ title: 'Poboczny 1' }, { title: 'Poboczny 2' }],
};

const CLOSED_DAY = { ...VALID_DAY, status: 'closed' as const };

const EVENING_ENTRY: EveningEntry = {
  goals: [
    { id: 'g0', completed: true },
    { id: 'g1', completed: false },
    { id: 'g2', completed: true, completedNote: 'prawie' },
  ],
  eveningNote: 'podsumowanie',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('getToday', () => {
  it('happy path: waliduje kopertę { day } i ją zwraca', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ day: VALID_DAY }));
    const result = await getToday();
    expect(result.day?.id).toBe('day-1');
    expect(fetchMock).toHaveBeenCalledWith('/api/days/today', expect.anything());
  });

  it('day === null jest poprawną odpowiedzią (brak wpisu porannego)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ day: null }));
    const result = await getToday();
    expect(result.day).toBeNull();
  });

  it('niezgodny kształt odpowiedzi OK → ApiRequestError (zerwany kontrakt)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));
    await expect(getToday()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('awaria sieci (fetch rzuca) → rzut przepuszczony, NIE ApiRequestError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getToday()).rejects.toBeInstanceOf(TypeError);
  });
});

describe('createDay', () => {
  it('happy path: POST z ciałem, zwraca goły Day', async () => {
    fetchMock.mockResolvedValue(jsonResponse(VALID_DAY, { status: 201 }));
    const day = await createDay(MORNING_ENTRY);
    expect(day.id).toBe('day-1');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(MORNING_ENTRY);
  });

  it('409 z kopertą błędu → ApiRequestError z code=DAY_ALREADY_EXISTS', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Dzień już istnieje', code: 'DAY_ALREADY_EXISTS' } },
        { ok: false, status: 409 },
      ),
    );
    await expect(createDay(MORNING_ENTRY)).rejects.toMatchObject({
      code: 'DAY_ALREADY_EXISTS',
      status: 409,
    });
  });

  it('błąd HTTP bez poprawnej koperty → ApiRequestError z generycznym komunikatem', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nope: 1 }, { ok: false, status: 500 }));
    await expect(createDay(MORNING_ENTRY)).rejects.toMatchObject({
      status: 500,
      code: undefined,
    });
  });
});

const GOAL_PATCH: GoalMarkPatch = { completed: true, completedNote: 'poszło' };

describe('markGoal', () => {
  it('happy path: PATCH /api/days/:date/goals/:goalId z ciałem, zwraca pełny Day', async () => {
    fetchMock.mockResolvedValue(jsonResponse(VALID_DAY));
    const day = await markGoal('2026-07-09', 'g0', GOAL_PATCH);
    expect(day.id).toBe('day-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/days/2026-07-09/goals/g0');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual(GOAL_PATCH);
  });

  it('403 DAY_FROZEN → ApiRequestError z tym code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Zamrożony', code: 'DAY_FROZEN' } },
        { ok: false, status: 403 },
      ),
    );
    await expect(markGoal('2026-07-01', 'g0', GOAL_PATCH)).rejects.toMatchObject({
      code: 'DAY_FROZEN',
      status: 403,
    });
  });

  it('400 GOAL_NOT_IN_DAY → ApiRequestError z tym code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Cel spoza dnia', code: 'GOAL_NOT_IN_DAY' } },
        { ok: false, status: 400 },
      ),
    );
    await expect(markGoal('2026-07-09', 'nope', GOAL_PATCH)).rejects.toMatchObject({
      code: 'GOAL_NOT_IN_DAY',
      status: 400,
    });
  });
});

describe('updateMorning', () => {
  it('happy path: PATCH /api/days/:date z ciałem, zwraca goły Day', async () => {
    fetchMock.mockResolvedValue(jsonResponse(VALID_DAY));
    const day = await updateMorning('2026-07-09', MORNING_ENTRY);
    expect(day.id).toBe('day-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/days/2026-07-09');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual(MORNING_ENTRY);
  });

  it('403 DAY_FROZEN → ApiRequestError z tym code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Zamrożony', code: 'DAY_FROZEN' } },
        { ok: false, status: 403 },
      ),
    );
    await expect(updateMorning('2026-07-01', MORNING_ENTRY)).rejects.toMatchObject({
      code: 'DAY_FROZEN',
      status: 403,
    });
  });
});

describe('submitEvening', () => {
  it('happy path: POST /api/days/:date/evening, zwraca goły Day (closed)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CLOSED_DAY));
    const day = await submitEvening('2026-07-09', EVENING_ENTRY);
    expect(day.status).toBe('closed');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/days/2026-07-09/evening');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(EVENING_ENTRY);
  });

  it('podzbiór (0 celów) też przechodzi — Zamknij dzień bez oznaczeń', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CLOSED_DAY));
    await submitEvening('2026-07-09', { goals: [] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ goals: [] });
  });

  it('409 DAY_ALREADY_CLOSED → ApiRequestError z tym code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Już zamknięty', code: 'DAY_ALREADY_CLOSED' } },
        { ok: false, status: 409 },
      ),
    );
    await expect(submitEvening('2026-07-09', EVENING_ENTRY)).rejects.toMatchObject({
      code: 'DAY_ALREADY_CLOSED',
      status: 409,
    });
  });

  it('400 GOAL_NOT_IN_DAY → ApiRequestError z tym code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Cel spoza dnia', code: 'GOAL_NOT_IN_DAY' } },
        { ok: false, status: 400 },
      ),
    );
    await expect(submitEvening('2026-07-09', EVENING_ENTRY)).rejects.toMatchObject({
      code: 'GOAL_NOT_IN_DAY',
      status: 400,
    });
  });
});

describe('getStreak', () => {
  it('happy path: waliduje i zwraca streak', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ current: 3, longest: 5, totalDays: 10, asOfDate: '2026-07-09' }),
    );
    const streak = await getStreak();
    expect(streak.current).toBe(3);
  });
});

describe('resetStreak', () => {
  it('happy path: POST /api/stats/streak/reset, zwraca zwalidowany Streak (current=0)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ current: 0, longest: 5, totalDays: 10, asOfDate: '2026-07-09' }),
    );
    const streak = await resetStreak();
    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(5);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/stats/streak/reset');
    expect(init.method).toBe('POST');
  });

  it('niezgodny kształt odpowiedzi OK → ApiRequestError (zerwany kontrakt)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nope: true }));
    await expect(resetStreak()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('błąd HTTP → ApiRequestError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'boom' } }, { ok: false, status: 500 }),
    );
    await expect(resetStreak()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('awaria sieci (fetch rzuca) → rzut przepuszczony, NIE ApiRequestError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(resetStreak()).rejects.toBeInstanceOf(TypeError);
  });
});

const SUMMARY = {
  date: '2026-07-08',
  status: 'closed' as const,
  mainTitle: 'Główny wczoraj',
  goalsCompleted: [true, false, null],
};

describe('getHistory', () => {
  it('happy path: bez kursora → najnowsza strona, waliduje { items, nextCursor }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [SUMMARY], nextCursor: '2026-07-08' }));
    const result = await getHistory();
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBe('2026-07-08');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/days/history');
  });

  it('paginacja: przekazuje ?before= i limit w query', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));
    await getHistory('2026-07-05', 10);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('before=2026-07-05');
    expect(url).toContain('limit=10');
  });

  it('błąd HTTP → ApiRequestError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'boom' } }, { ok: false, status: 500 }),
    );
    await expect(getHistory()).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe('getDayByDate', () => {
  it('happy path: GET /api/days/:date, zwraca { day }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ day: CLOSED_DAY }));
    const result = await getDayByDate('2026-07-08');
    expect(result.day?.status).toBe('closed');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/days/2026-07-08');
  });

  it('brak wpisu na datę → { day: null }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ day: null }));
    const result = await getDayByDate('2026-07-01');
    expect(result.day).toBeNull();
  });

  it('błąd HTTP → ApiRequestError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'zła data', code: 'FUTURE_DATE' } },
        { ok: false, status: 400 },
      ),
    );
    await expect(getDayByDate('2030-01-01')).rejects.toMatchObject({ code: 'FUTURE_DATE' });
  });
});

// ── Faza 2: challenges („Lista celów") ─────────────────────────────────────────────────────────

const CHALLENGE: ChallengeCreate = {
  title: 'Lipiec',
  tiers: [
    { threshold: 10, reward: 'Kino' },
    { threshold: 20, reward: 'Książka' },
  ],
};

const CHALLENGE_WITH_POINTS = {
  id: 'ch-1',
  title: 'Lipiec',
  startDate: '2026-07-13',
  endDate: '2026-08-11',
  createdAt: '2026-07-13T08:00:00.000Z',
  totalPoints: 7,
  nextThreshold: 10,
  pointsToNext: 3,
  tiers: [
    { threshold: 10, reward: 'Kino', unlocked: false },
    { threshold: 20, reward: 'Książka', unlocked: false },
  ],
};

const CHALLENGE_SUMMARY = {
  id: 'ch-old',
  title: 'Czerwiec',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  totalPoints: 42,
};

describe('createChallenge', () => {
  it('happy path: POST /api/challenges z ciałem, zwraca ChallengeWithPoints (201)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CHALLENGE_WITH_POINTS, { status: 201 }));
    const result = await createChallenge(CHALLENGE);
    expect(result.id).toBe('ch-1');
    expect(result.totalPoints).toBe(7);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/challenges');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(CHALLENGE);
  });

  it('409 z kopertą błędu → ApiRequestError z code=ACTIVE_CHALLENGE_EXISTS', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Masz już aktywną listę', code: 'ACTIVE_CHALLENGE_EXISTS' } },
        { ok: false, status: 409 },
      ),
    );
    await expect(createChallenge(CHALLENGE)).rejects.toMatchObject({
      code: 'ACTIVE_CHALLENGE_EXISTS',
      status: 409,
    });
  });

  it('niezgodny kształt odpowiedzi OK → ApiRequestError (zerwany kontrakt)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nope: true }, { status: 201 }));
    await expect(createChallenge(CHALLENGE)).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('awaria sieci (fetch rzuca) → rzut przepuszczony, NIE ApiRequestError', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(createChallenge(CHALLENGE)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('getActiveChallenge', () => {
  it('happy path: waliduje kopertę { challenge } i ją zwraca', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ challenge: CHALLENGE_WITH_POINTS }));
    const result = await getActiveChallenge();
    expect(result.challenge?.id).toBe('ch-1');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/challenges/active');
  });

  it('brak aktywnej → { challenge: null }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ challenge: null }));
    const result = await getActiveChallenge();
    expect(result.challenge).toBeNull();
  });

  it('niezgodny kształt odpowiedzi OK → ApiRequestError (zerwany kontrakt)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }));
    await expect(getActiveChallenge()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('awaria sieci (fetch rzuca) → rzut przepuszczony', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getActiveChallenge()).rejects.toBeInstanceOf(TypeError);
  });
});

describe('listChallenges', () => {
  it('happy path: GET /api/challenges, waliduje { items }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [CHALLENGE_SUMMARY] }));
    const result = await listChallenges();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe('ch-old');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/challenges');
  });

  it('błąd HTTP → ApiRequestError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'boom' } }, { ok: false, status: 500 }),
    );
    await expect(listChallenges()).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe('getChallenge', () => {
  it('happy path: GET /api/challenges/:id, zwraca { challenge }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ challenge: CHALLENGE_WITH_POINTS }));
    const result = await getChallenge('ch-1');
    expect(result.challenge?.id).toBe('ch-1');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/challenges/ch-1');
  });

  it('brak listy → { challenge: null }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ challenge: null }));
    const result = await getChallenge('nope');
    expect(result.challenge).toBeNull();
  });
});

describe('updateChallenge', () => {
  it('happy path: PATCH /api/challenges/:id z ciałem, zwraca ChallengeWithPoints', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CHALLENGE_WITH_POINTS));
    const result = await updateChallenge('ch-1', CHALLENGE);
    expect(result.id).toBe('ch-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/challenges/ch-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual(CHALLENGE);
  });

  it('błąd HTTP → ApiRequestError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: 'boom' } }, { ok: false, status: 500 }),
    );
    await expect(updateChallenge('ch-1', CHALLENGE)).rejects.toBeInstanceOf(ApiRequestError);
  });
});
