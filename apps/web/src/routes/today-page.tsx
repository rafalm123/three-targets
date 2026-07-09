import type { Day } from '@trzy-cele/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { DayReadonlyView, GoalCard } from '../components/day-readonly';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { getToday, updateMorning } from '../lib/api';
import { useSession } from '../lib/auth-client';
import { EveningForm } from './evening-form';
import { MorningForm } from './morning-form';

/**
 * Widok dnia dzisiejszego — HUB (FE-9). Woła `GET /api/days/today` i kieruje do właściwej akcji
 * wg stanu dnia:
 *  - `day === null`      → formularz poranny `MorningForm` (FE-7),
 *  - `evening_pending`   → widok dnia z akcjami: „Oznacz wieczór" (FE-8) i „Edytuj poranek" (BE-11),
 *  - `closed`            → read-only podsumowanie dnia.
 *
 * Przy `evening_pending` HUB ma trzy pod-tryby lokalne: `view` (domyślny), `edit` (edycja poranna),
 * `evening` (odznaczanie wieczorne). Wszystkie operują na tym samym pobranym dniu; sukces mutacji
 * podmienia dzień w stanie bez ponownego fetcha, a konflikt (dzień zamknięty/zniknął w międzyczasie)
 * przeładowuje HUB. Wyloguj/streak żyją w AppShell (globalny chrome), nie tutaj.
 */

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; day: Day | null };

/** Pod-tryb widoku dnia przy `evening_pending`. */
type DayMode = 'view' | 'edit' | 'evening';

export function TodayPage(): ReactNode {
  const { data: session } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);

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

  /** Konflikt mutacji (dzień zamknięty/zniknął) — pokaż komunikat i przeładuj świeży stan. */
  const handleConflict = useCallback(
    (code: string | undefined): void => {
      setNotice(conflictMessage(code));
      void load();
    },
    [load],
  );

  return (
    <AppShell showNav>
      {notice ? (
        <div className="form-error" role="alert">
          {notice}
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
        <MorningForm
          onSuccess={(day) => {
            setNotice(null);
            setState({ kind: 'ready', day });
          }}
          onConflict={() => {
            void load();
          }}
        />
      ) : null}

      {state.kind === 'ready' && state.day !== null ? (
        <DayHub
          day={state.day}
          userName={session?.user.name ?? session?.user.email}
          onDayChange={(day) => {
            setNotice(null);
            setState({ kind: 'ready', day });
          }}
          onConflict={handleConflict}
        />
      ) : null}
    </AppShell>
  );
}

/** Kontener widoku istniejącego dnia z pod-trybami (view/edit/evening). */
function DayHub({
  day,
  userName,
  onDayChange,
  onConflict,
}: {
  day: Day;
  userName?: string;
  onDayChange: (day: Day) => void;
  onConflict: (code: string | undefined) => void;
}): ReactNode {
  const [mode, setMode] = useState<DayMode>('view');
  const isClosed = day.status === 'closed';

  // Zamknięty dzień jest niemutowalny — zawsze read-only, ignorujemy pod-tryby.
  if (isClosed) return <ClosedDay day={day} userName={userName} />;

  if (mode === 'edit') {
    return (
      <MorningForm
        initialDay={day}
        heading="Edytuj poranek"
        submitLabel="Zapisz zmiany"
        submittingLabel="Zapisywanie…"
        onSubmit={updateMorning}
        onSuccess={(updated) => {
          setMode('view');
          onDayChange(updated);
        }}
        onConflict={onConflict}
        onCancel={() => setMode('view')}
      />
    );
  }

  if (mode === 'evening') {
    return (
      <>
        <button
          type="button"
          className="button button-secondary back-button"
          onClick={() => setMode('view')}
        >
          ← Wróć
        </button>
        <EveningForm day={day} onClosed={onDayChange} onConflict={onConflict} />
      </>
    );
  }

  return (
    <PendingDay
      day={day}
      userName={userName}
      onEdit={() => setMode('edit')}
      onEvening={() => setMode('evening')}
    />
  );
}

/** Widok dnia `evening_pending`: cele + akcje „Oznacz wieczór" i „Edytuj poranek". */
function PendingDay({
  day,
  userName,
  onEdit,
  onEvening,
}: {
  day: Day;
  userName?: string;
  onEdit: () => void;
  onEvening: () => void;
}): ReactNode {
  const main = day.goals.find((g) => g.kind === 'main');
  const secondary = day.goals.filter((g) => g.kind === 'secondary');

  return (
    <section className="day-view" aria-label="Dzisiejszy dzień">
      <header className="day-view-header">
        <h2>Dziś{userName ? `, ${userName}` : ''}</h2>
        <span className="day-badge">Wieczór do oznaczenia</span>
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

      <div className="day-actions">
        <button type="button" className="button" onClick={onEvening}>
          Oznacz wieczór
        </button>
        <button type="button" className="button button-secondary" onClick={onEdit}>
          Edytuj poranek
        </button>
      </div>
    </section>
  );
}

/** Widok dnia `closed`: podsumowanie read-only (cele z oznaczeniami + notatki). */
function ClosedDay({ day, userName }: { day: Day; userName?: string }): ReactNode {
  return (
    <section className="day-view" aria-label="Dzisiejszy dzień">
      <header className="day-view-header">
        <h2>Dziś{userName ? `, ${userName}` : ''}</h2>
        <span className="day-badge day-badge-closed">Dzień zamknięty</span>
      </header>

      <DayReadonlyView day={day} />

      <EmptyState
        title="Dzień zamknięty"
        message="Ten dzień jest już podsumowany i tylko do odczytu."
      />
    </section>
  );
}

/** Komunikat dla konfliktu mutacji dnia (wspólny dla wieczoru i edycji). */
function conflictMessage(code: string | undefined): string {
  switch (code) {
    case 'DAY_ALREADY_CLOSED':
      return 'Ten dzień został już zamknięty. Odświeżono aktualny stan.';
    case 'GOAL_MISMATCH':
      return 'Cele dnia zmieniły się w międzyczasie. Odświeżono — spróbuj ponownie.';
    case 'NO_DAY_TODAY':
      return 'Nie znaleziono dzisiejszego dnia. Odświeżono aktualny stan.';
    default:
      return 'Stan dnia się zmienił. Odświeżono aktualny stan.';
  }
}
