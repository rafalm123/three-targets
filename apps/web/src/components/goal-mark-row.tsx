import type { Goal, GoalMarkPatch } from '@trzy-cele/shared';
import { useState, type ReactNode } from 'react';

/**
 * Wiersz oznaczania POJEDYNCZEGO celu (per-cel, natychmiastowy zapis). Przełącznik Dowiezione/
 * Niedowiezione zapisuje od razu przez `onMark` (razem z bieżącą treścią notatki), bez czekania na
 * domknięcie dnia. Notatkę można zapisać osobno („Zapisz notatkę") — wtedy zachowujemy dotychczasowe
 * `completed` (nie ruszamy wyboru). Zapis jest odpięty od statusu dnia; jego wynik (pełny `Day`)
 * oddajemy w górę przez `onMark`, który podmienia dzień w stanie HUB.
 *
 * `completed === null` = jeszcze nieoznaczony (dozwolone; „Zamknij dzień" nie wymaga kompletu).
 * Notatkę bez wybranego `completed` NIE wysyłamy (per-cel patch wymaga `completed`) — przycisk
 * „Zapisz notatkę" jest wtedy nieaktywny, z podpowiedzią, że najpierw trzeba wybrać opcję.
 */
export function GoalMarkRow({
  goal,
  index,
  onMark,
}: {
  goal: Goal;
  /** Pozycja w liście (główny=0) — do etykiety „Cel poboczny N" spójnej z EveningForm. */
  index: number;
  /** Zapis per-cel; zwraca pełny `Day`. Rzuca `ApiRequestError` (HTTP) lub surowy rzut fetch. */
  onMark: (goalId: string, patch: GoalMarkPatch) => Promise<void>;
}): ReactNode {
  const [completed, setCompleted] = useState<boolean | null>(goal.completed);
  const [note, setNote] = useState(goal.completedNote ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMain = goal.kind === 'main';
  const groupName = `mark-${goal.id}`;
  const noteId = `${groupName}-note`;

  const buildPatch = (nextCompleted: boolean): GoalMarkPatch => {
    const trimmed = note.trim();
    return { completed: nextCompleted, ...(trimmed.length > 0 ? { completedNote: trimmed } : {}) };
  };

  const save = async (patch: GoalMarkPatch): Promise<void> => {
    setError(null);
    setSaving(true);
    try {
      await onMark(goal.id, patch);
    } catch {
      setError('Nie udało się zapisać. Spróbuj ponownie.');
    } finally {
      setSaving(false);
    }
  };

  const choose = (next: boolean): void => {
    setCompleted(next);
    void save(buildPatch(next));
  };

  const saveNote = (): void => {
    if (completed === null) return;
    void save(buildPatch(completed));
  };

  return (
    <fieldset className="goal-fieldset" aria-busy={saving || undefined}>
      <legend>
        {isMain ? 'Cel główny' : `Cel poboczny ${index}`}: {goal.title}
      </legend>

      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mark-choice" role="radiogroup" aria-label={`Czy dowieziony: ${goal.title}`}>
        <label className="mark-option">
          <input
            type="radio"
            name={groupName}
            checked={completed === true}
            disabled={saving}
            onChange={() => choose(true)}
          />
          Dowiezione
        </label>
        <label className="mark-option">
          <input
            type="radio"
            name={groupName}
            checked={completed === false}
            disabled={saving}
            onChange={() => choose(false)}
          />
          Niedowiezione
        </label>
      </div>

      <div className="field">
        <label htmlFor={noteId}>Notatka (opcjonalnie)</label>
        <textarea
          id={noteId}
          maxLength={2000}
          value={note}
          disabled={saving}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <button
        type="button"
        className="button button-secondary"
        disabled={saving || completed === null}
        onClick={saveNote}
      >
        Zapisz notatkę
      </button>
      {completed === null ? (
        <span className="field-error">Wybierz najpierw, czy cel został dowieziony.</span>
      ) : null}
    </fieldset>
  );
}
