/**
 * Reguły przejść maszyny stanów dnia — jedno miejsce (decyzja @sa). Czyste, testowalne
 * (bez DB). Maszyna: `evening_pending → closed`. „Dziś" wyznacza wywołujący (day-boundary/BE-16);
 * tu walidujemy stan i spójność oznaczanych celów.
 */

export type CloseGuardCode = 'NO_DAY_TODAY' | 'DAY_ALREADY_CLOSED' | 'GOAL_MISMATCH';

export type CloseGuardResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 400; code: CloseGuardCode; message: string };

/**
 * Czy dzień można zamknąć wieczornym odznaczeniem `markGoalIds`?
 * - brak dnia → 404 (nie ma czego zamykać — najpierw wpis poranny),
 * - dzień `closed` → 409 (niemutowalny),
 * - oznaczenia ≠ dokładnie cele dnia → 400 (spójność: wszystkie 3 cele, te same id).
 */
export function checkCanCloseDay(
  day: { status: string; goals: { id: string }[] } | null,
  markGoalIds: readonly string[],
): CloseGuardResult {
  if (!day) {
    return { ok: false, status: 404, code: 'NO_DAY_TODAY', message: 'Brak wpisu na dziś do zamknięcia' };
  }
  if (day.status === 'closed') {
    return { ok: false, status: 409, code: 'DAY_ALREADY_CLOSED', message: 'Dzień jest już zamknięty' };
  }
  const dayIds = new Set(day.goals.map((g) => g.id));
  const markIds = new Set(markGoalIds);
  const exactMatch = dayIds.size === markIds.size && [...dayIds].every((id) => markIds.has(id));
  if (!exactMatch) {
    return {
      ok: false,
      status: 400,
      code: 'GOAL_MISMATCH',
      message: 'Oznaczenia muszą dotyczyć dokładnie celów tego dnia',
    };
  }
  return { ok: true };
}
