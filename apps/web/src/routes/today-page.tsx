import type { Day, Goal } from '@trzy-cele/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { getToday } from '../lib/api';
import { authClient, useSession } from '../lib/auth-client';
import { authErrorMessage, GENERIC_AUTH_ERROR } from '../lib/auth-errors';
import { MorningForm } from './morning-form';

/**
 * Widok dnia dzisiejszego — HUB (FE-9). Woła `GET /api/days/today` i kieruje do właściwej akcji
 * wg stanu dnia:
 *  - `day === null`      → CTA „wypełnij poranek" → formularz `MorningForm` (FE-7),
 *  - `evening_pending`   → 3 cele + CTA „oznacz wieczór" (sam widok wieczoru to Plaster 2 —
 *                          tu przycisk disabled, `// TODO FE-8`),
 *  - `closed`            → read-only podsumowanie dnia.
 *
 * Ładowanie odpinamy w tym miejscu (jeden fetch na wejściu), by nie migać przy przełączaniu
 * pod-stanów. Wyloguj żyje w `headerActions` (przeniesione z dawnego HomePage).
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; day: Day | null };

export function TodayPage(): ReactNode {
  const { data: session } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    // getToday rzuca ApiRequestError (HTTP !ok) lub surowy rzut fetch (awaria sieci) — obie
    // ścieżki lądują w ErrorState z akcją ponowienia.
    try {
      const { day } = await getToday();
      setState({ kind: 'ready', day });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSignOut(): Promise<void> {
    setSignOutError(null);
    setSigningOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) setSignOutError(authErrorMessage(error));
    } catch {
      setSignOutError(GENERIC_AUTH_ERROR);
    } finally {
      setSigningOut(false);
    }
  }

  const logoutButton = (
    <button
      type="button"
      className="button button-secondary"
      onClick={handleSignOut}
      disabled={signingOut}
    >
      {signingOut ? 'Wylogowywanie…' : 'Wyloguj'}
    </button>
  );

  return (
    <AppShell headerActions={logoutButton} showNav>
      {signOutError ? (
        <div className="form-error" role="alert">
          {signOutError}
        </div>
      ) : null}

      {state.kind === 'loading' ? <LoadingState label="Ładowanie dnia…" /> : null}

      {state.kind === 'error' ? (
        <ErrorState
          message="Nie udało się wczytać dzisiejszego dnia."
          onRetry={() => {
            void load();
          }}
        />
      ) : null}

      {state.kind === 'ready' && state.day === null ? (
        <MorningForm onCreated={(day) => setState({ kind: 'ready', day })} onDayAlreadyExists={load} />
      ) : null}

      {state.kind === 'ready' && state.day !== null ? (
        <DayView day={state.day} userName={session?.user.name ?? session?.user.email} />
      ) : null}
    </AppShell>
  );
}

/** Widok istniejącego dnia: cele + (wg statusu) CTA wieczoru albo podsumowanie read-only. */
function DayView({ day, userName }: { day: Day; userName?: string }): ReactNode {
  const main = day.goals.find((g) => g.kind === 'main');
  const secondary = day.goals.filter((g) => g.kind === 'secondary');
  const isClosed = day.status === 'closed';

  return (
    <section className="day-view" aria-label="Dzisiejszy dzień">
      <header className="day-view-header">
        <h2>Dziś{userName ? `, ${userName}` : ''}</h2>
        {/* Modyfikator dokładamy tylko dla `closed` (jedyny stan zmieniający wygląd) — brak
            martwego selektora `.day-badge-evening_pending` bez reguły. */}
        <span className={`day-badge${isClosed ? ' day-badge-closed' : ''}`}>
          {isClosed ? 'Dzień zamknięty' : 'Wieczór do oznaczenia'}
        </span>
      </header>

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

      {isClosed ? (
        <>
          {day.eveningNote ? (
            <div className="day-note">
              <span className="day-note-label">Notatka wieczorna</span>
              <p>{day.eveningNote}</p>
            </div>
          ) : null}
          <EmptyState
            title="Dzień zamknięty"
            message="Ten dzień jest już podsumowany i tylko do odczytu."
          />
        </>
      ) : (
        <div className="day-actions">
          {/* TODO FE-8: pełny widok „Wieczór" (odznaczanie 3 celów). Na razie zablokowane. */}
          <button type="button" className="button" disabled title="Dostępne wkrótce">
            Oznacz wieczór
          </button>
          <p className="form-footer">Oznaczanie wieczoru dojdzie wkrótce.</p>
        </div>
      )}
    </section>
  );
}

/** Pojedynczy cel: tytuł, notatka i (po oznaczeniu wieczorem) status dowiezienia. */
function GoalCard({ goal, primary = false }: { goal: Goal; primary?: boolean }): ReactNode {
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
      {goal.completedNote ? <p className="goal-note goal-note-completed">{goal.completedNote}</p> : null}
    </article>
  );
}
