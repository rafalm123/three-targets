import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  createDay,
  getDayByDate,
  getHistory,
  getStreak,
  getToday,
  submitEvening,
  updateMorning,
} from './api';
import type { EveningEntry, MorningEntry } from '@trzy-cele/shared';

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

describe('updateMorning', () => {
  it('happy path: PATCH /api/days/today z ciałem, zwraca goły Day', async () => {
    fetchMock.mockResolvedValue(jsonResponse(VALID_DAY));
    const day = await updateMorning(MORNING_ENTRY);
    expect(day.id).toBe('day-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/days/today');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual(MORNING_ENTRY);
  });

  it('409 DAY_ALREADY_CLOSED → ApiRequestError z tym code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Dzień zamknięty', code: 'DAY_ALREADY_CLOSED' } },
        { ok: false, status: 409 },
      ),
    );
    await expect(updateMorning(MORNING_ENTRY)).rejects.toMatchObject({
      code: 'DAY_ALREADY_CLOSED',
      status: 409,
    });
  });
});

describe('submitEvening', () => {
  it('happy path: POST /api/days/today/evening, zwraca goły Day (closed)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(CLOSED_DAY));
    const day = await submitEvening(EVENING_ENTRY);
    expect(day.status).toBe('closed');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/days/today/evening');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(EVENING_ENTRY);
  });

  it('409 DAY_ALREADY_CLOSED → ApiRequestError z tym code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Już zamknięty', code: 'DAY_ALREADY_CLOSED' } },
        { ok: false, status: 409 },
      ),
    );
    await expect(submitEvening(EVENING_ENTRY)).rejects.toMatchObject({
      code: 'DAY_ALREADY_CLOSED',
      status: 409,
    });
  });

  it('400 GOAL_MISMATCH → ApiRequestError z tym code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { message: 'Niezgodne cele', code: 'GOAL_MISMATCH' } },
        { ok: false, status: 400 },
      ),
    );
    await expect(submitEvening(EVENING_ENTRY)).rejects.toMatchObject({
      code: 'GOAL_MISMATCH',
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
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'boom' } }, { ok: false, status: 500 }));
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
      jsonResponse({ error: { message: 'zła data', code: 'FUTURE_DATE' } }, { ok: false, status: 400 }),
    );
    await expect(getDayByDate('2030-01-01')).rejects.toMatchObject({ code: 'FUTURE_DATE' });
  });
});
