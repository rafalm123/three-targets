import { eveningEntrySchema, type Day, type EveningEntry, type Goal } from '@trzy-cele/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiRequestError, GENERIC_API_ERROR, submitEvening } from '../lib/api';

/**
 * Formularz „Wieczór" (FE-8): dla każdego z 3 celów pobranego dnia oznaczamy dowieziony/nie
 * (`completed` bool) + opcjonalną `completedNote`; plus `eveningNote`. Submit →
 * `POST /api/days/today/evening` → dzień `closed` → `onClosed(day)` (HUB pokazuje read-only).
 *
 * KLUCZOWE: `EveningEntry.goals` to DOKŁADNIE 3 obiekty `{id, completed, completedNote?}`, gdzie
 * `id` = id celu z pobranego dnia (`day.goals[i].id`) — NIE wymyślamy id. Kolejność: główny +
 * poboczne wg `position`, tak jak zwrócił serwer.
 *
 * UX: `completed` wymaga JAWNEGO wyboru dla każdego celu (nie zakładamy „niedowieziony" po cichu —
 * to zamknęłoby dzień bez świadomej decyzji). Dopóki któryś cel nie ma wyboru → błąd pola + brak
 * wysyłki. Konflikty BE (`409 DAY_ALREADY_CLOSED`, `400 GOAL_MISMATCH`, `404 NO_DAY_TODAY`) →
 * przeładowanie HUB (przy `GOAL_MISMATCH` dodatkowo komunikat, bo to nietypowy stan).
 */

/** Cel uporządkowany do wyświetlenia: główny pierwszy, potem poboczne wg `position`. */
function orderedGoals(day: Day): Goal[] {
  const main = day.goals.filter((g) => g.kind === 'main');
  const secondary = day.goals
    .filter((g) => g.kind === 'secondary')
    .sort((a, b) => a.position - b.position);
  return [...main, ...secondary];
}

/** Lokalny stan oznaczenia celu. `completed: null` = jeszcze nie wybrano (wymaga decyzji). */
interface Mark {
  completed: boolean | null;
  note: string;
}

export function EveningForm({
  day,
  onClosed,
  onConflict,
}: {
  day: Day;
  /** Sukces → dzień `closed` w górę (HUB pokazuje podsumowanie read-only). */
  onClosed: (day: Day) => void;
  /** Konflikt HTTP → wołający przeładowuje HUB (opcjonalny komunikat dla GOAL_MISMATCH). */
  onConflict: (code: string | undefined) => void;
}): ReactNode {
  const goals = orderedGoals(day);
  const [marks, setMarks] = useState<Mark[]>(() => goals.map(() => ({ completed: null, note: '' })));
  const [eveningNote, setEveningNote] = useState('');
  const [markErrors, setMarkErrors] = useState<boolean[]>(() => goals.map(() => false));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setMark(i: number, patch: Partial<Mark>): void {
    setMarks((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    // Wymuszamy jawny wybór dowieziony/nie dla każdego celu przed budową ładunku.
    const missing = marks.map((m) => m.completed === null);
    if (missing.some(Boolean)) {
      setMarkErrors(missing);
      setFormError('Zaznacz przy każdym celu, czy został dowieziony.');
      return;
    }
    setMarkErrors(goals.map(() => false));

    const entry: EveningEntry = {
      goals: goals.map((g, i) => {
        const note = marks[i]!.note.trim();
        return {
          id: g.id,
          completed: marks[i]!.completed as boolean,
          ...(note.length > 0 ? { completedNote: note } : {}),
        };
      }),
      ...(eveningNote.trim().length > 0 ? { eveningNote: eveningNote.trim() } : {}),
    };

    // Walidacja kontraktem przed wysyłką (dokładnie 3 cele, długości not) — jedno źródło prawdy.
    const parsed = eveningEntrySchema.safeParse(entry);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? GENERIC_API_ERROR);
      return;
    }

    setSubmitting(true);
    // submitEvening rzuca ApiRequestError (HTTP !ok) lub surowy rzut fetch (awaria sieci).
    try {
      const closed = await submitEvening(parsed.data);
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
      <h2>Wieczór — oznacz dowiezienie</h2>

      {formError ? (
        <div className="form-error" role="alert">
          {formError}
        </div>
      ) : null}

      {goals.map((goal, i) => {
        const isMain = goal.kind === 'main';
        const groupName = `evening-${goal.id}`;
        const err = markErrors[i];
        return (
          <fieldset key={goal.id} className="goal-fieldset">
            <legend>
              {isMain ? 'Cel główny' : `Cel poboczny ${i}`}: {goal.title}
            </legend>

            <div
              className="mark-choice"
              role="radiogroup"
              aria-label={`Czy dowieziony: ${goal.title}`}
              aria-invalid={err ? true : undefined}
            >
              <label className="mark-option">
                <input
                  type="radio"
                  name={groupName}
                  checked={marks[i]!.completed === true}
                  onChange={() => setMark(i, { completed: true })}
                />
                Dowiezione
              </label>
              <label className="mark-option">
                <input
                  type="radio"
                  name={groupName}
                  checked={marks[i]!.completed === false}
                  onChange={() => setMark(i, { completed: false })}
                />
                Niedowiezione
              </label>
            </div>
            {err ? <span className="field-error">Wybierz jedną z opcji.</span> : null}

            <div className="field">
              <label htmlFor={`${groupName}-note`}>Notatka (opcjonalnie)</label>
              <textarea
                id={`${groupName}-note`}
                maxLength={2000}
                value={marks[i]!.note}
                onChange={(e) => setMark(i, { note: e.target.value })}
              />
            </div>
          </fieldset>
        );
      })}

      <div className="field">
        <label htmlFor="evening-note">Notatka wieczorna (opcjonalnie)</label>
        <textarea
          id="evening-note"
          maxLength={2000}
          value={eveningNote}
          onChange={(e) => setEveningNote(e.target.value)}
        />
      </div>

      <button type="submit" className="button" disabled={submitting}>
        {submitting ? 'Zapisywanie…' : 'Zamknij dzień'}
      </button>
    </form>
  );
}

/** Kody, które wołający obsługuje przez przeładowanie HUB (nie jako błąd w formularzu). */
function isEveningConflict(code: string | undefined): boolean {
  return code === 'DAY_ALREADY_CLOSED' || code === 'GOAL_MISMATCH' || code === 'NO_DAY_TODAY';
}
