/**
 * Reguły przejść maszyny stanów dnia — jedno miejsce (decyzja @sa). Czyste, testowalne
 * (bez DB). Maszyna: `evening_pending → closed` (dwustanowa, bez „draft"). „Dziś" wyznacza
 * wywołujący (day-boundary/BE-16); tu walidujemy istnienie i spójność oznaczanych celów.
 *
 * BE-19 — niemutowalność jest „PO DACIE", nie „po statusie": dzień „dziś" jest mutowalny także
 * gdy `closed` (edycja poranna / re-submit wieczoru). Zamrożenie dni PRZESZŁYCH egzekwuje wywołujący
 * strukturalnie — endpointy mutacji ładują wyłącznie dzień „dziś" (po userId_date z userToday), więc
 * dzień przeszły jest tu nieosiągalny. Dlatego guard nie odrzuca już `closed`.
 */

// `DAY_ALREADY_CLOSED` zachowane w unii kodów: nadal emitowane obronnie przez atomową bramkę wyścigu
// w days.ts (gate.count===0) i konsumowane przez FE. Dla dnia „dziś" ścieżka ta jest praktycznie martwa.
export type MutableGuardCode = 'NO_DAY_TODAY' | 'DAY_ALREADY_CLOSED';
export type CloseGuardCode = MutableGuardCode | 'GOAL_MISMATCH';

export type MutableGuardResult =
  | { ok: true }
  | { ok: false; status: 404 | 409; code: MutableGuardCode; message: string };

export type CloseGuardResult =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 400; code: CloseGuardCode; message: string };

/**
 * Czy dzień „dziś" wolno mutować (edycja poranna BE-11 / odznaczenie BE-12)?
 * - brak dnia → 404 (najpierw wpis poranny),
 * - `closed` „dziś" → OK (BE-19: mutowalny po dacie, re-edycja dozwolona).
 * Wspólna podstawa dla wszystkich mutacji dnia (jedno miejsce — decyzja @sa).
 */
export function checkDayMutable(day: { status: string } | null): MutableGuardResult {
  if (!day) {
    return { ok: false, status: 404, code: 'NO_DAY_TODAY', message: 'Brak wpisu na dziś' };
  }
  return { ok: true };
}

/**
 * Czy dzień „dziś" można zamknąć/re-submitować wieczornym odznaczeniem `markGoalIds`?
 * Rozszerza `checkDayMutable` (istnienie; closed „dziś" dozwolony — BE-19) o spójność celów:
 * - oznaczenia ≠ dokładnie cele dnia → 400 (wszystkie 3 cele, te same id).
 */
export function checkCanCloseDay(
  day: { status: string; goals: { id: string }[] } | null,
  markGoalIds: readonly string[],
): CloseGuardResult {
  const base = checkDayMutable(day);
  if (!base.ok) return base;
  const dayIds = new Set((day?.goals ?? []).map((g) => g.id));
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
