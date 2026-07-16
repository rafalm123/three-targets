import type { Day, GoalMarkPatch } from '@trzy-cele/shared';
import { useState, type ReactNode } from 'react';
import { GoalMarkRow } from '../components/goal-mark-row';
import { ApiRequestError, markGoal } from '../lib/api';
import { EveningForm } from './evening-form';

/**
 * Widok oznaczania dnia PER-CEL + opcjonalne domknięcie — WSPÓŁDZIELONY przez „dziś"
 * (`evening_pending`) i baner „Dokończ wczorajszy dzień" (wczoraj-`evening_pending`). Operuje na
 * `day.date`, więc ta sama ścieżka działa dla obu dat (serwer rozstrzyga okno łaski).
 *
 * Interakcja:
 *  - każdy cel ma przełącznik Dowiezione/Niedowiezione zapisywany NATYCHMIAST (`markGoal`), bez
 *    czekania na domknięcie; sukces podmienia `Day` w stanie (`onDayChange`), bez pełnego reloadu,
 *  - oznaczenie CELU GŁÓWNEGO woła `onMainMarked` (seria zależy od `main.completed`, nie od zamknięcia),
 *  - „Zamknij dzień" (opcjonalne) → `EveningForm`: zapis `eveningNote` + `status='closed'`. Bez
 *    bramki kompletu — nieoznaczone cele zostają niedowiezione.
 *
 * Konflikty per-cel (`403 DAY_FROZEN`, `404 NO_DAY_TODAY`, `400 GOAL_NOT_IN_DAY`) → `onConflict`
 * (wołający pokazuje komunikat i przeładowuje stan).
 */
export function DayMarking({
  day,
  onDayChange,
  onConflict,
  onMainMarked,
}: {
  day: Day;
  onDayChange: (day: Day) => void;
  onConflict: (code: string | undefined) => void;
  /** Oznaczono cel główny → odśwież serię (zależy od `main.completed`). */
  onMainMarked: () => void;
}): ReactNode {
  const [closing, setClosing] = useState(false);

  const main = day.goals.find((g) => g.kind === 'main');
  const secondary = day.goals.filter((g) => g.kind === 'secondary');
  const ordered = main ? [main, ...secondary] : secondary;

  const handleMark = async (goalId: string, patch: GoalMarkPatch): Promise<void> => {
    // markGoal rzuca ApiRequestError (HTTP !ok) lub surowy rzut fetch (awaria sieci). Konflikty
    // domenowe kierujemy do onConflict (przeładowanie), sieć/kontrakt zostają rzutem dla GoalMarkRow.
    try {
      const updated = await markGoal(day.date, goalId, patch);
      onDayChange(updated);
      if (goalId === main?.id) onMainMarked();
    } catch (err) {
      if (err instanceof ApiRequestError && isMarkConflict(err.code)) {
        onConflict(err.code);
        return;
      }
      throw err;
    }
  };

  if (closing) {
    return (
      <>
        <button
          type="button"
          className="button button-secondary back-button"
          onClick={() => setClosing(false)}
        >
          ← Wróć do oznaczania
        </button>
        <EveningForm
          day={day}
          onClosed={(closed) => {
            // Domknięcie mogło sfinalizować dowiezienie głównego → seria zależy od main.completed.
            onDayChange(closed);
            onMainMarked();
          }}
          onConflict={onConflict}
        />
      </>
    );
  }

  return (
    <section className="day-marking" aria-label="Oznaczanie celów">
      {ordered.map((goal, i) => (
        <GoalMarkRow key={goal.id} goal={goal} index={i} onMark={handleMark} />
      ))}

      {day.morningNote ? (
        <div className="day-note">
          <span className="day-note-label">Notatka poranna</span>
          <p>{day.morningNote}</p>
        </div>
      ) : null}

      <div className="day-actions">
        <button type="button" className="button" onClick={() => setClosing(true)}>
          Zamknij dzień
        </button>
      </div>
    </section>
  );
}

/** Kody per-cel, które wołający obsługuje przez przeładowanie (nie jako błąd inline w wierszu). */
function isMarkConflict(code: string | undefined): boolean {
  return code === 'DAY_FROZEN' || code === 'NO_DAY_TODAY' || code === 'GOAL_NOT_IN_DAY';
}
