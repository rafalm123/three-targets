import type { Day, Goal } from '@trzy-cele/shared';
import type { ReactNode } from 'react';

/**
 * Read-only prezentacja dnia i celów — WSPÓŁDZIELONA przez HUB („dziś" zamknięty/w toku) i
 * podgląd dnia z historii (FE-10). Bez akcji i mutacji: tylko cele + notatki.
 *
 * ZAŁOŻENIE porządku celów spójne z resztą FE dnia: polegamy na kolejności z serwera
 * (BE gwarantuje `orderBy position asc`), nie sortujemy po stronie FE.
 */

/** Pojedynczy cel: tytuł, notatka i (po oznaczeniu wieczorem) status dowiezienia. */
export function GoalCard({ goal, primary = false }: { goal: Goal; primary?: boolean }): ReactNode {
  const mark =
    goal.completed === null
      ? null
      : goal.completed
        ? { label: 'Dowiezione', cls: 'goal-mark-done' }
        : { label: 'Niedowiezione', cls: 'goal-mark-missed' };

  return (
    <article className={`goal-card${primary ? ' goal-card-primary' : ''}`}>
      <div className="goal-card-head">
        <span className="goal-kind">{primary ? 'Główny' : 'Poboczny'}</span>
        {mark ? <span className={`goal-mark ${mark.cls}`}>{mark.label}</span> : null}
      </div>
      <h3 className="goal-title">{goal.title}</h3>
      {goal.note ? <p className="goal-note">{goal.note}</p> : null}
      {goal.completedNote ? (
        <p className="goal-note goal-note-completed">{goal.completedNote}</p>
      ) : null}
    </article>
  );
}

/** Cele dnia (główny + poboczne) + notatki poranna/wieczorna — czysty read-only blok. */
export function DayReadonlyView({ day }: { day: Day }): ReactNode {
  const main = day.goals.find((g) => g.kind === 'main');
  const secondary = day.goals.filter((g) => g.kind === 'secondary');

  return (
    <>
      {main ? <GoalCard goal={main} primary /> : null}
      {secondary.map((g) => (
        <GoalCard key={g.id} goal={g} />
      ))}

      {day.morningNote ? (
        <div className="day-note">
          <span className="day-note-label">Notatka poranna</span>
          <p>{day.morningNote}</p>
        </div>
      ) : null}

      {day.eveningNote ? (
        <div className="day-note">
          <span className="day-note-label">Notatka wieczorna</span>
          <p>{day.eveningNote}</p>
        </div>
      ) : null}
    </>
  );
}
