import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createDay, getStreak, getToday } from './api';
import type { MorningEntry } from '@trzy-cele/shared';

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

describe('getStreak', () => {
  it('happy path: waliduje i zwraca streak', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ current: 3, longest: 5, totalDays: 10, asOfDate: '2026-07-09' }),
    );
    const streak = await getStreak();
    expect(streak.current).toBe(3);
  });
});
