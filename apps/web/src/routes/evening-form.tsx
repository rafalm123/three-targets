import { eveningEntrySchema, type Day, type EveningEntry, type Goal } from '@trzy-cele/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiRequestError, GENERIC_API_ERROR, submitEvening } from '../lib/api';

/**
 * Domknięcie dnia (finalizacja wieczoru). Po pivocie na oznaczanie PER-CEL (natychmiastowy zapis
 * przez `GoalMarkRow`) ten formularz NIE jest już all-or-nothing bramkowany: jego rolą jest zapis
 * `eveningNote` + ustawienie `status='closed'`. Wysyłamy PODZBIÓR (0..3) już oznaczonych celów —
 * nieoznaczone (`completed === null`) po prostu zostają jak są (niedowiezione), bez blokady.
 *
 * Prefill z dnia (re-submit dzisiejszego `closed` — FE-B): BE robi PEŁNE zastąpienie oznaczeń z
 * przesłanego podzbioru, więc startujemy od zapisanego stanu (żeby poprawa jednej rzeczy nie
 * wyzerowała reszty). Dla `evening_pending` cele mogą już mieć `completed` z per-cel oznaczania —
 * też je przekazujemy. Cele wciąż nieoznaczone pomijamy w podzbiorze.
 *
 * Konflikty BE (`403 DAY_FROZEN`, `409 DAY_ALREADY_CLOSED`, `400 GOAL_NOT_IN_DAY`, `404
 * NO_DAY_TODAY`) → wołający przeładowuje HUB i pokazuje komunikat (`notice`) dla każdego z tych kodów.
 */

/**
 * Cel uporządkowany do wyświetlenia: główny pierwszy, potem poboczne.
 * ZAŁOŻENIE (spójne w całym FE dnia): polegamy na kolejności z serwera (BE gwarantuje
 * `orderBy position asc`). Nie sortujemy po `position` po stronie FE — jedno źródło porządku.
 */
function orderedGoals(day: Day): Goal[] {
  const main = day.goals.filter((g) => g.kind === 'main');
  const secondary = day.goals.filter((g) => g.kind === 'secondary');
  return [...main, ...secondary];
}

export function EveningForm({
  day,
  onClosed,
  onConflict,
}: {
  day: Day;
  /** Sukces → dzień `closed` w górę (HUB pokazuje podsumowanie read-only). */
  onClosed: (day: Day) => void;
  /** Konflikt HTTP → wołający przeładowuje HUB (opcjonalny komunikat dla kodu). */
  onConflict: (code: string | undefined) => void;
}): ReactNode {
  const goals = orderedGoals(day);
  const [eveningNote, setEveningNote] = useState(day.eveningNote ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const entry: EveningEntry = {
      // Podzbiór: tylko cele już oznaczone (completed !== null). Nieoznaczone zostają jak są.
      goals: goals
        .filter((g) => g.completed !== null)
        .map((g) => {
          const note = g.completedNote?.trim() ?? '';
          return {
            id: g.id,
            completed: g.completed as boolean,
            ...(note.length > 0 ? { completedNote: note } : {}),
          };
        }),
      ...(eveningNote.trim().length > 0 ? { eveningNote: eveningNote.trim() } : {}),
    };

    const parsed = eveningEntrySchema.safeParse(entry);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? GENERIC_API_ERROR);
      return;
    }

    setSubmitting(true);
    // submitEvening rzuca ApiRequestError (HTTP !ok) lub surowy rzut fetch (awaria sieci).
    try {
      const closed = await submitEvening(day.date, parsed.data);
      onClosed(closed);
    } catch (err) {
      if (err instanceof ApiRequestError && isEveningConflict(err.code)) {
        onConflict(err.code);
        return;
      }
      setFormError(err instanceof ApiRequestError ? err.message : GENERIC_API_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <h2>Zamknij dzień</h2>

      {formError ? (
        <div className="form-error" role="alert">
          {formError}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="evening-note">Notatka wieczorna (opcjonalnie)</label>
        <textarea
          id="evening-note"
          maxLength={2000}
          value={eveningNote}
          onChange={(e) => setEveningNote(e.target.value)}
        />
      </div>

      <div className="day-actions">
        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Zapisywanie…' : 'Zamknij dzień'}
        </button>
      </div>
    </form>
  );
}

/** Kody, które wołający obsługuje przez przeładowanie HUB (nie jako błąd w formularzu). */
function isEveningConflict(code: string | undefined): boolean {
  return (
    code === 'DAY_ALREADY_CLOSED' ||
    code === 'GOAL_NOT_IN_DAY' ||
    code === 'NO_DAY_TODAY' ||
    code === 'DAY_FROZEN'
  );
}
