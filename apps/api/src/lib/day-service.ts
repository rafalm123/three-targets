import { addDaysIso } from './day-boundary';

/**
 * Reguły przejść maszyny stanów dnia — jedno miejsce (decyzja @sa). Czyste, testowalne
 * (bez DB). Maszyna: `evening_pending → closed` (dwustanowa, bez „draft"). „Dziś" wyznacza
 * wywołujący (day-boundary/BE-16); tu walidujemy istnienie i przynależność oznaczanych celów.
 *
 * Okno łaski (per-goal-marking): mutacje (oznaczanie/edycja/domknięcie) dozwolone dla dnia
 * DZISIEJSZEGO oraz WCZORAJSZEGO — ale wczorajszy tylko dopóki `evening_pending` (niezamknięty).
 * Każdy inny przeszły dzień jest zamrożony (`DAY_FROZEN`). Rozstrzyga to `resolveEditableDate`.
 */

// `DAY_ALREADY_CLOSED` zachowane w unii kodów: nadal emitowane obronnie przez atomową bramkę wyścigu
// w days.ts (gate.count===0) i konsumowane przez FE.
export type MutableGuardCode = 'NO_DAY_TODAY' | 'DAY_ALREADY_CLOSED';
export type CloseGuardCode = MutableGuardCode | 'GOAL_NOT_IN_DAY';

export type MutableGuardResult =
  | { ok: true }
  | { ok: false; status: 404 | 409; code: MutableGuardCode; message: string };

export type CloseGuardResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 400; code: CloseGuardCode; message: string };

export type EditableGuardResult =
  | { ok: true }
  | { ok: false; status: 403 | 404; code: 'DAY_FROZEN' | 'NO_DAY_TODAY'; message: string };

/**
 * Czy dzień wolno mutować z uwagi na samo istnienie rekordu?
 * - brak dnia → 404 (najpierw wpis poranny).
 * Okno czasowe (dziś/wczoraj) rozstrzyga osobno `resolveEditableDate`.
 */
export function checkDayMutable(day: { status: string } | null): MutableGuardResult {
  if (!day) {
    return { ok: false, status: 404, code: 'NO_DAY_TODAY', message: 'Brak wpisu na ten dzień' };
  }
  return { ok: true };
}

/**
 * Okno edycji dnia: dziś (zawsze) lub wczoraj-jeśli-`evening_pending`; wpp. zamrożony.
 * Sam guard NIE rozstrzyga istnienia dnia dla „dziś" (404 obsługuje handler po załadowaniu rekordu) —
 * dla wczoraj brak rekordu ⇒ nie może być `evening_pending`, więc wpada w `DAY_FROZEN`.
 */
export function resolveEditableDate(params: {
  date: string;
  today: string;
  day: { status: string } | null;
}): EditableGuardResult {
  const { date, today, day } = params;
  if (date === today) return { ok: true };
  if (date === addDaysIso(today, -1) && day?.status === 'evening_pending') return { ok: true };
  return { ok: false, status: 403, code: 'DAY_FROZEN', message: 'Ten dzień jest zamknięty do edycji' };
}

/**
 * Czy przesłane oznaczenia można zastosować przy domknięciu dnia?
 * Zniesione all-or-nothing: dozwolony dowolny PODZBIÓR (0..3) celów dnia. Warunek:
 * każde przesłane id musi należeć do dnia (inaczej 400 `GOAL_NOT_IN_DAY`).
 */
export function checkCanCloseDay(
  day: { status: string; goals: { id: string }[] } | null,
  markGoalIds: readonly string[],
): CloseGuardResult {
  const base = checkDayMutable(day);
  if (!base.ok) return base;
  const dayIds = new Set((day?.goals ?? []).map((g) => g.id));
  const allBelong = markGoalIds.every((id) => dayIds.has(id));
  if (!allBelong) {
    return {
      ok: false,
      status: 400,
      code: 'GOAL_NOT_IN_DAY',
      message: 'Oznaczenia muszą dotyczyć celów tego dnia',
    };
  }
  return { ok: true };
}
