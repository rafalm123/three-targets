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
 * poboczne, w kolejności zwróconej przez serwer (BE gwarantuje `orderBy position asc` — patrz
 * niżej, wspólne założenie w całym FE dnia).
 *
 * UX: `completed` wymaga JAWNEGO wyboru dla każdego celu (nie zakładamy „niedowieziony" po cichu —
 * to zamknęłoby dzień bez świadomej decyzji). Dopóki wszystkie 3 cele nie są ocenione → przycisk
 * „Zamknij dzień" jest disabled z licznikiem, ile zostało (żeby disabled nie wyglądał jak błąd).
 * Konflikty BE (`409 DAY_ALREADY_CLOSED`, `400 GOAL_MISMATCH`, `404 NO_DAY_TODAY`) → wołający
 * przeładowuje HUB i pokazuje komunikat (`notice`) dla każdego z tych kodów.
 */

/**
 * Cel uporządkowany do wyświetlenia: główny pierwszy, potem poboczne.
 * ZAŁOŻENIE (spójne w całym FE dnia — EveningForm/PendingDay/ClosedDay/MorningForm.initialState):
 * polegamy na kolejności z serwera, którą BE gwarantuje (`orderBy position asc`). Nie sortujemy
 * po `position` po stronie FE — jedno źródło porządku, mniej rozjazdów.
 */
function orderedGoals(day: Day): Goal[] {
  const main = day.goals.filter((g) => g.kind === 'main');
  const secondary = day.goals.filter((g) => g.kind === 'secondary');
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
  // Prefill z dnia (FE-B, re-submit dzisiejszego `closed`): dzień MA już `completed`/`completedNote`/
  // `eveningNote`. BE robi PEŁNE zastąpienie, więc gdybyśmy startowali od pustki, poprawa jednego celu
  // wyzerowałaby resztę. Startujemy więc od zapisanego stanu; przy `evening_pending` pola są puste
  // (completed=null, note=''), więc dla pierwszego oznaczania zachowanie jest bez zmian.
  const [marks, setMarks] = useState<Mark[]>(() =>
    goals.map((g) => ({ completed: g.completed, note: g.completedNote ?? '' })),
  );
  const [eveningNote, setEveningNote] = useState(day.eveningNote ?? '');
  const [markErrors, setMarkErrors] = useState<boolean[]>(() => goals.map(() => false));
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Ile celów pozostało do oceny — steruje disabled przycisku i czytelnym licznikiem, żeby
  // zablokowany przycisk nie wyglądał jak zepsuty (decyzja @sa, wzmacnia jawny wybór).
  const remaining = marks.filter((m) => m.completed === null).length;

  function setMark(i: number, patch: Partial<Mark>): void {
    setMarks((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
    // Dokonanie wyboru (completed) natychmiast czyści błąd „Wybierz jedną z opcji" dla tego celu.
    if (patch.completed !== undefined) {
      setMarkErrors((prev) => (prev[i] ? prev.map((e, idx) => (idx === i ? false : e)) : prev));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    // Wymuszamy jawny wybór dowieziony/nie dla każdego celu przed budową ładunku. To DEFENSE
    // IN DEPTH: normalnie przycisk „Zamknij dzień" jest disabled dopóki `remaining > 0`, więc ta
    // gałąź nie odpali z UI — ale gdyby submit przeszedł inną drogą, oznaczamy braki per-cel
    // (błąd czyszczony w `setMark` po wyborze) i pokazujemy zbiorczy komunikat.
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
              aria-describedby={err ? `${groupName}-error` : undefined}
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
            {err ? (
              <span id={`${groupName}-error`} className="field-error">
                Wybierz jedną z opcji.
              </span>
            ) : null}

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

      <div className="day-actions">
        <button type="submit" className="button" disabled={submitting || remaining > 0}>
          {submitting ? 'Zapisywanie…' : 'Zamknij dzień'}
        </button>
        {remaining > 0 ? (
          <p className="form-footer" role="status" aria-live="polite">
            Oceń jeszcze {remaining} {goalWord(remaining)}, aby zamknąć dzień.
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Polska odmiana słowa „cel" dla licznika 1–3 (główny + 2 poboczne). */
function goalWord(n: number): string {
  return n === 1 ? 'cel' : 'cele';
}

/** Kody, które wołający obsługuje przez przeładowanie HUB (nie jako błąd w formularzu). */
function isEveningConflict(code: string | undefined): boolean {
  return code === 'DAY_ALREADY_CLOSED' || code === 'GOAL_MISMATCH' || code === 'NO_DAY_TODAY';
}
