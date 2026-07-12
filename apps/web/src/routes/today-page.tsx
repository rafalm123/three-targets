import type { Day } from '@trzy-cele/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { DayReadonlyView, GoalCard } from '../components/day-readonly';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { useStreakRefresh } from '../components/streak-refresh';
import { getToday, updateMorning } from '../lib/api';
import { useSession } from '../lib/auth-client';
import { EveningForm } from './evening-form';
import { MorningForm } from './morning-form';

/**
 * Widok dnia dzisiejszego — HUB (FE-9). Woła `GET /api/days/today` i kieruje do właściwej akcji
 * wg stanu dnia:
 *  - `day === null`      → formularz poranny `MorningForm` (FE-7),
 *  - `evening_pending`   → widok dnia z akcjami: „Oznacz wieczór" (FE-8) i „Edytuj poranek" (BE-11),
 *  - `closed`            → podsumowanie dnia + „Edytuj dziś" (FE-B).
 *
 * ZMIANA (FE-B): dzień DZISIEJSZY jest edytowalny również po zamknięciu (`closed`). Endpointy
 * `PATCH /api/days/today` (poprawa poranka) i `POST /api/days/today/evening` (ponowny wieczór)
 * działają dla „dziś" niezależnie od statusu. Dni PRZESZŁE pozostają zamrożone (i tak nie trafiają
 * do tego widoku — historia jest osobno, read-only).
 *
 * HUB ma pod-tryby lokalne: `view` (domyślny), `edit` (edycja poranna), `evening` (odznaczanie
 * wieczorne) — dostępne zarówno dla `evening_pending`, jak i `closed` (dziś). Dla `closed` widok
 * `view` ma dodatkowy przełącznik „Edytuj dziś" (`editOpen`) odsłaniający obie ścieżki. Wszystkie
 * operują na tym samym pobranym dniu; sukces mutacji podmienia dzień w stanie bez ponownego fetcha
 * i wraca do `view` (panel edycji zwinięty), a konflikt (dzień zniknął w międzyczasie) przeładowuje
 * HUB. Wyloguj/streak żyją w AppShell (globalny chrome).
 */

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; day: Day | null };

/** Pod-tryb widoku dnia (view/edit/evening). */
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
  // Panel edycji zamkniętego dnia (FE-B). Trzymany w DayHub (nie w ClosedDay), żeby po zapisie
  // wrócić do zwiniętego podsumowania — nawet gdy re-render dostaje ten sam `day.id`.
  const [editOpen, setEditOpen] = useState(false);
  const { bumpStreak } = useStreakRefresh();
  const isClosed = day.status === 'closed';

  /** Powrót do czystego widoku podsumowania po udanej mutacji (zwija panel edycji closed). */
  const backToView = (): void => {
    setMode('view');
    setEditOpen(false);
  };

  if (mode === 'edit') {
    return (
      <MorningForm
        initialDay={day}
        heading="Edytuj poranek"
        submitLabel="Zapisz zmiany"
        submittingLabel="Zapisywanie…"
        onSubmit={updateMorning}
        onSuccess={(updated) => {
          backToView();
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
        <EveningForm
          day={day}
          onClosed={(closed) => {
            // Dzień właśnie zamknięty (lub ponownie zamknięty po edycji — FE-B) → dowiezienie
            // głównego celu mogło się zmienić, więc seria też: odśwież wskaźnik od razu (CR NIT-1).
            backToView();
            bumpStreak();
            onDayChange(closed);
          }}
          onConflict={onConflict}
        />
      </>
    );
  }

  // view-mode: closed → podsumowanie z „Edytuj dziś" (dziś edytowalny mimo zamknięcia — FE-B);
  // evening_pending → widok celów z akcjami wieczoru/poranka.
  if (isClosed) {
    return (
      <ClosedDay
        day={day}
        userName={userName}
        editOpen={editOpen}
        onOpenEdit={() => setEditOpen(true)}
        onCloseEdit={() => setEditOpen(false)}
        onEdit={() => setMode('edit')}
        onEvening={() => setMode('evening')}
      />
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

/**
 * Widok dnia `closed`: podsumowanie (cele z oznaczeniami + notatki) + akcja „Edytuj dziś".
 * DZISIEJSZY dzień jest edytowalny mimo zamknięcia (FE-B): „Edytuj dziś" odsłania dwie ścieżki —
 * poprawę poranka (PATCH) i ponowne oznaczenie wieczoru (re-submit). Domyślnie panel edycji jest
 * zwinięty, żeby widok pozostał czytelnym podsumowaniem, a edycja była świadomą decyzją.
 */
function ClosedDay({
  day,
  userName,
  editOpen,
  onOpenEdit,
  onCloseEdit,
  onEdit,
  onEvening,
}: {
  day: Day;
  userName?: string;
  editOpen: boolean;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onEdit: () => void;
  onEvening: () => void;
}): ReactNode {
  return (
    <section className="day-view" aria-label="Dzisiejszy dzień">
      <header className="day-view-header">
        <h2>Dziś{userName ? `, ${userName}` : ''}</h2>
        <span className="day-badge day-badge-closed">Dzień zamknięty</span>
      </header>

      <DayReadonlyView day={day} />

      <EmptyState
        title="Dzień zamknięty"
        message="Ten dzień jest podsumowany — ale dopóki trwa, możesz go jeszcze poprawić."
      />

      {editOpen ? (
        <div className="day-actions">
          <button type="button" className="button" onClick={onEvening}>
            Oznacz wieczór ponownie
          </button>
          <button type="button" className="button button-secondary" onClick={onEdit}>
            Edytuj poranek
          </button>
          <button type="button" className="button button-secondary" onClick={onCloseEdit}>
            Anuluj
          </button>
        </div>
      ) : (
        <div className="day-actions">
          <button type="button" className="button button-secondary" onClick={onOpenEdit}>
            Edytuj dziś
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Komunikat dla konfliktu mutacji dnia (wspólny dla wieczoru i edycji). Kody 409 to teraz ścieżka
 * MARTWA-OBRONNA: BE świadomie zostawia je pod wyścig/zniknięcie dnia (edycja dzisiejszego `closed`
 * zwraca 200). Dlatego copy dla `DAY_ALREADY_CLOSED` jest neutralne — nie sugerujemy, że zamknięcie
 * blokuje edycję, bo dziś nie blokuje.
 */
function conflictMessage(code: string | undefined): string {
  switch (code) {
    case 'DAY_ALREADY_CLOSED':
      return 'Stan dnia zmienił się w międzyczasie. Odświeżono aktualny stan.';
    case 'GOAL_MISMATCH':
      return 'Cele dnia zmieniły się w międzyczasie. Odświeżono — spróbuj ponownie.';
    case 'NO_DAY_TODAY':
      return 'Nie znaleziono dzisiejszego dnia. Odświeżono aktualny stan.';
    default:
      return 'Stan dnia się zmienił. Odświeżono aktualny stan.';
  }
}
