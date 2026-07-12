import { describe, expect, it } from 'vitest';
import { checkCanCloseDay, checkDayMutable } from './day-service';

const goals = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('checkDayMutable', () => {
  it('brak dnia → 404 NO_DAY_TODAY', () => {
    expect(checkDayMutable(null)).toMatchObject({ ok: false, status: 404, code: 'NO_DAY_TODAY' });
  });
  // BE-19 — niemutowalność „po dacie", nie „po statusie": dzień „dziś" jest edytowalny także
  // gdy `closed` (wywołujący ładuje wyłącznie „dziś" po userId_date, więc closed = dzisiejszy zamknięty).
  it('dzień closed (dzisiejszy) → ok (mutowalny; re-edycja dozwolona)', () => {
    expect(checkDayMutable({ status: 'closed' })).toEqual({ ok: true });
  });
  it('evening_pending → ok', () => {
    expect(checkDayMutable({ status: 'evening_pending' })).toEqual({ ok: true });
  });
});

describe('checkCanCloseDay', () => {
  it('brak dnia → 404 NO_DAY_TODAY', () => {
    expect(checkCanCloseDay(null, ['a', 'b', 'c'])).toMatchObject({
      ok: false,
      status: 404,
      code: 'NO_DAY_TODAY',
    });
  });

  // BE-19 — dzisiejszy closed można re-submitować (mutowalny po dacie), o ile cele pasują.
  it('dzień closed (dzisiejszy) + dokładnie te cele → ok (re-submit dozwolony)', () => {
    expect(checkCanCloseDay({ status: 'closed', goals }, ['a', 'b', 'c'])).toEqual({ ok: true });
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

  it('duplikaty id (np. [a,a,b]) → 400 (dedup zbioru daje rozmiar ≠ 3)', () => {
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, ['a', 'a', 'b'])).toMatchObject({
      ok: false,
      status: 400,
      code: 'GOAL_MISMATCH',
    });
  });

  it('evening_pending + dokładnie te cele (dowolna kolejność) → ok', () => {
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, ['c', 'a', 'b'])).toEqual({ ok: true });
  });
});
