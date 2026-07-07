import { describe, expect, it } from 'vitest';
import { checkCanCloseDay } from './day-service';

const goals = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('checkCanCloseDay', () => {
  it('brak dnia → 404 NO_DAY_TODAY', () => {
    expect(checkCanCloseDay(null, ['a', 'b', 'c'])).toMatchObject({
      ok: false,
      status: 404,
      code: 'NO_DAY_TODAY',
    });
  });

  it('dzień już closed → 409 DAY_ALREADY_CLOSED (niemutowalny)', () => {
    expect(checkCanCloseDay({ status: 'closed', goals }, ['a', 'b', 'c'])).toMatchObject({
      ok: false,
      status: 409,
      code: 'DAY_ALREADY_CLOSED',
    });
  });

  it('obce/niepełne id celów → 400 GOAL_MISMATCH', () => {
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, ['a', 'b', 'x'])).toMatchObject({
      ok: false,
      status: 400,
      code: 'GOAL_MISMATCH',
    });
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, ['a', 'b'])).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('evening_pending + dokładnie te cele (dowolna kolejność) → ok', () => {
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, ['c', 'a', 'b'])).toEqual({ ok: true });
  });
});
