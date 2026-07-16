import { describe, expect, it } from 'vitest';
import { checkCanCloseDay, checkDayMutable, resolveEditableDate } from './day-service';

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

describe('checkCanCloseDay (podzbiór oznaczeń; bez all-or-nothing)', () => {
  it('brak dnia → 404 NO_DAY_TODAY', () => {
    expect(checkCanCloseDay(null, ['a', 'b', 'c'])).toMatchObject({
      ok: false,
      status: 404,
      code: 'NO_DAY_TODAY',
    });
  });

  it('pełny zestaw oznaczeń → ok', () => {
    expect(checkCanCloseDay({ status: 'closed', goals }, ['a', 'b', 'c'])).toEqual({ ok: true });
  });

  it('podzbiór (mniej niż wszystkie) → ok (all-or-nothing zniesione)', () => {
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, ['a'])).toEqual({ ok: true });
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, ['a', 'b'])).toEqual({ ok: true });
  });

  it('brak oznaczeń → ok (samo domknięcie)', () => {
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, [])).toEqual({ ok: true });
  });

  it('id spoza dnia → 400 GOAL_NOT_IN_DAY', () => {
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, ['a', 'x'])).toMatchObject({
      ok: false,
      status: 400,
      code: 'GOAL_NOT_IN_DAY',
    });
  });

  it('dowolna kolejność podzbioru → ok', () => {
    expect(checkCanCloseDay({ status: 'evening_pending', goals }, ['c', 'a'])).toEqual({ ok: true });
  });
});

describe('resolveEditableDate (okno łaski: dziś + wczoraj-jeśli-pending)', () => {
  const today = '2026-07-16';
  const yesterday = '2026-07-15';
  const dayBefore = '2026-07-14';

  it('dziś → ok (niezależnie od statusu/istnienia dnia)', () => {
    expect(resolveEditableDate({ date: today, today, day: null })).toEqual({ ok: true });
    expect(resolveEditableDate({ date: today, today, day: { status: 'closed' } })).toEqual({ ok: true });
    expect(resolveEditableDate({ date: today, today, day: { status: 'evening_pending' } })).toEqual({
      ok: true,
    });
  });

  it('wczoraj + evening_pending → ok', () => {
    expect(
      resolveEditableDate({ date: yesterday, today, day: { status: 'evening_pending' } }),
    ).toEqual({ ok: true });
  });

  it('wczoraj + closed → 403 DAY_FROZEN', () => {
    expect(resolveEditableDate({ date: yesterday, today, day: { status: 'closed' } })).toMatchObject({
      ok: false,
      status: 403,
      code: 'DAY_FROZEN',
    });
  });

  it('wczoraj bez dnia → 403 DAY_FROZEN', () => {
    expect(resolveEditableDate({ date: yesterday, today, day: null })).toMatchObject({
      ok: false,
      status: 403,
      code: 'DAY_FROZEN',
    });
  });

  it('przedwczoraj → 403 DAY_FROZEN (nawet gdy pending)', () => {
    expect(
      resolveEditableDate({ date: dayBefore, today, day: { status: 'evening_pending' } }),
    ).toMatchObject({ ok: false, status: 403, code: 'DAY_FROZEN' });
  });
});
