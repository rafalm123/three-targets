import type { Day } from '@trzy-cele/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { DayReadonlyView } from '../components/day-readonly';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { useStreakRefresh } from '../components/streak-refresh';
import { getDayByDate, getStreak, getToday, updateMorning } from '../lib/api';
import { useSession } from '../lib/auth-client';
import { previousDayIso } from '../lib/day-date';
import { DayMarking } from './day-marking';
import { MorningForm } from './morning-form';

/**
 * Widok dnia dzisiejszego — HUB. Woła `GET /api/days/today` i kieruje do właściwej akcji wg stanu dnia:
 *  - `day === null`      → formularz poranny `MorningForm`,
 *  - `evening_pending`   → oznaczanie PER-CEL (`DayMarking`) + „Edytuj poranek",
 *  - `closed`            → podsumowanie dnia + „Edytuj dziś" (per-cel/poranek — dziś edytowalny).
 *
 * PER-CEL (nowy model): oznaczanie celów jest odpięte od zamykania dnia — każdy cel zapisuje się
 * natychmiast (`markGoal`), a „Zamknij dzień" (w `DayMarking`) to opcjonalna finalizacja notatki +
 * `status='closed'`, bez bramki kompletu. Seria zależy od `main.completed`, więc oznaczenie głównego
 * odświeża wskaźnik od razu (bez czekania na zamknięcie).
 *
 * OKNO ŁASKI (wczoraj): jeśli wczorajszy dzień jest `evening_pending`, HUB pokazuje baner „Dokończ
 * wczorajszy dzień" prowadzący do TEGO SAMEGO per-cel UI, ale operującego na dacie wczorajszej.
 *
 * Sukces mutacji podmienia dzień w stanie bez ponownego fetcha; konflikt (dzień zamrożony/zniknął)
 * przeładowuje HUB. Wyloguj/streak żyją w AppShell (globalny chrome).
 */

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; day: Day | null };

export function TodayPage(): ReactNode {
  // Treść żyje WEWNĄTRZ AppShell, bo `useStreakRefresh` wymaga `StreakRefreshProvider` z shella
  // (poza providerem hook degraduje do no-op — bump serii nie zadziałałby).
  return (
    <AppShell showNav>
      <TodayContent />
    </AppShell>
  );
}

function TodayContent(): ReactNode {
  const { data: session } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [yesterday, setYesterday] = useState<Day | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { bumpStreak } = useStreakRefresh();

  /**
   * Wczorajszy niezamknięty dzień (okno łaski). Kotwica daty pochodzi z SERWERA (granica doby to
   * `users.timezone`, nie zegar przeglądarki): `day.date` gdy dziś istnieje, inaczej `streak.asOfDate`.
   * Ładujemy miękko — błąd wczoraj nie może zepsuć widoku dziś (baner po prostu się nie pojawi).
   */
  const loadYesterday = useCallback(async (todayDay: Day | null): Promise<void> => {
    try {
      const anchor = todayDay?.date ?? (await getStreak()).asOfDate;
      const { day } = await getDayByDate(previousDayIso(anchor));
      setYesterday(day && day.status === 'evening_pending' ? day : null);
    } catch {
      setYesterday(null);
    }
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    // getToday rzuca ApiRequestError (HTTP !ok) lub surowy rzut fetch (awaria sieci) — obie
    // ścieżki lądują w ErrorState z akcją ponowienia.
    try {
      const { day } = await getToday();
      setState({ kind: 'ready', day });
      void loadYesterday(day);
    } catch {
      setState({ kind: 'error' });
    }
  }, [loadYesterday]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Konflikt mutacji (dzień zamrożony/zamknięty/zniknął) — pokaż komunikat i przeładuj świeży stan. */
  const handleConflict = useCallback(
    (code: string | undefined): void => {
      setNotice(conflictMessage(code));
      void load();
    },
    [load],
  );

  return (
    <>
      {notice ? (
        <div className="form-error" role="alert">
          {notice}
        </div>
      ) : null}

      {yesterday ? (
        <YesterdayBanner
          day={yesterday}
          onDayChange={(day) => {
            setNotice(null);
            setYesterday(day.status === 'evening_pending' ? day : null);
          }}
          onConflict={handleConflict}
          onMainMarked={bumpStreak}
        />
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
            void loadYesterday(day);
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
          onMainMarked={bumpStreak}
        />
      ) : null}
    </>
  );
}

/**
 * Baner „Dokończ wczorajszy dzień" — afordancja okna łaski. Pokazywany TYLKO gdy wczoraj istnieje i
 * jest `evening_pending`. Prowadzi do tego samego per-cel UI (`DayMarking`), ale operuje na dacie
 * wczorajszej (`day.date` = wczoraj). Domknięcie/zmiana statusu na `closed` chowa baner (wołający
 * czyści `yesterday`).
 */
function YesterdayBanner({
  day,
  onDayChange,
  onConflict,
  onMainMarked,
}: {
  day: Day;
  onDayChange: (day: Day) => void;
  onConflict: (code: string | undefined) => void;
  onMainMarked: () => void;
}): ReactNode {
  return (
    <section className="day-banner" aria-label="Dokończ wczorajszy dzień">
      <header className="day-banner-head">
        <h3>Dokończ wczorajszy dzień</h3>
        <span className="day-badge">Wczoraj do oznaczenia</span>
      </header>
      <DayMarking
        day={day}
        onDayChange={onDayChange}
        onConflict={onConflict}
        onMainMarked={onMainMarked}
      />
    </section>
  );
}

/** Kontener widoku istniejącego dnia „dziś" (pending → oznaczanie; closed → podsumowanie + edycja). */
function DayHub({
  day,
  userName,
  onDayChange,
  onConflict,
  onMainMarked,
}: {
  day: Day;
  userName?: string;
  onDayChange: (day: Day) => void;
  onConflict: (code: string | undefined) => void;
  onMainMarked: () => void;
}): ReactNode {
  const [editingMorning, setEditingMorning] = useState(false);
  // Panel edycji zamkniętego dnia (FE-B) — odsłania oznaczanie per-cel i edycję poranka dla „dziś".
  const [editOpen, setEditOpen] = useState(false);
  const isClosed = day.status === 'closed';

  if (editingMorning) {
    return (
      <MorningForm
        initialDay={day}
        heading="Edytuj poranek"
        submitLabel="Zapisz zmiany"
        submittingLabel="Zapisywanie…"
        onSubmit={(entry) => updateMorning(day.date, entry)}
        onSuccess={(updated) => {
          setEditingMorning(false);
          setEditOpen(false);
          onDayChange(updated);
        }}
        onConflict={onConflict}
        onCancel={() => setEditingMorning(false)}
      />
    );
  }

  if (isClosed) {
    return (
      <ClosedDay
        day={day}
        userName={userName}
        editOpen={editOpen}
        onOpenEdit={() => setEditOpen(true)}
        onCloseEdit={() => setEditOpen(false)}
        onEditMorning={() => setEditingMorning(true)}
        onDayChange={onDayChange}
        onConflict={onConflict}
        onMainMarked={onMainMarked}
      />
    );
  }

  return (
    <section className="day-view" aria-label="Dzisiejszy dzień">
      <header className="day-view-header">
        <h2>Dziś{userName ? `, ${userName}` : ''}</h2>
        <span className="day-badge">Wieczór do oznaczenia</span>
      </header>

      <DayMarking
        day={day}
        onDayChange={onDayChange}
        onConflict={onConflict}
        onMainMarked={onMainMarked}
      />

      <div className="day-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setEditingMorning(true)}
        >
          Edytuj poranek
        </button>
      </div>
    </section>
  );
}

/**
 * Widok dnia `closed`: podsumowanie (cele z oznaczeniami + notatki) + akcja „Edytuj dziś".
 * DZISIEJSZY dzień jest edytowalny mimo zamknięcia (FE-B): „Edytuj dziś" odsłania dwie ścieżki —
 * ponowne oznaczanie per-cel (`DayMarking`, wraz z ponownym „Zamknij dzień") i poprawę poranka.
 * Domyślnie panel edycji jest zwinięty, żeby widok pozostał czytelnym podsumowaniem.
 */
function ClosedDay({
  day,
  userName,
  editOpen,
  onOpenEdit,
  onCloseEdit,
  onEditMorning,
  onDayChange,
  onConflict,
  onMainMarked,
}: {
  day: Day;
  userName?: string;
  editOpen: boolean;
  onOpenEdit: () => void;
  onCloseEdit: () => void;
  onEditMorning: () => void;
  onDayChange: (day: Day) => void;
  onConflict: (code: string | undefined) => void;
  onMainMarked: () => void;
}): ReactNode {
  return (
    <section className="day-view" aria-label="Dzisiejszy dzień">
      <header className="day-view-header">
        <h2>Dziś{userName ? `, ${userName}` : ''}</h2>
        <span className="day-badge day-badge-closed">Dzień zamknięty</span>
      </header>

      {editOpen ? (
        <>
          <DayMarking
            day={day}
            onDayChange={onDayChange}
            onConflict={onConflict}
            onMainMarked={onMainMarked}
          />
          <div className="day-actions">
            <button type="button" className="button button-secondary" onClick={onEditMorning}>
              Edytuj poranek
            </button>
            <button type="button" className="button button-secondary" onClick={onCloseEdit}>
              Anuluj
            </button>
          </div>
        </>
      ) : (
        <>
          <DayReadonlyView day={day} />
          <EmptyState
            title="Dzień zamknięty"
            message="Ten dzień jest podsumowany — ale dopóki trwa, możesz go jeszcze poprawić."
          />
          <div className="day-actions">
            <button type="button" className="button button-secondary" onClick={onOpenEdit}>
              Edytuj dziś
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Komunikat dla konfliktu mutacji dnia (wspólny dla oznaczania, wieczoru i edycji poranka). 403
 * `DAY_FROZEN` = dzień poza oknem łaski (np. wczoraj zamknięto w międzyczasie). 409/400/404 to ścieżki
 * obronne (wyścig/zniknięcie). Copy neutralne: nie sugerujemy, że zamknięcie blokuje edycję „dziś".
 */
function conflictMessage(code: string | undefined): string {
  switch (code) {
    case 'DAY_FROZEN':
      return 'Ten dzień jest już zamknięty do edycji. Odświeżono aktualny stan.';
    case 'DAY_ALREADY_CLOSED':
      return 'Stan dnia zmienił się w międzyczasie. Odświeżono aktualny stan.';
    case 'GOAL_NOT_IN_DAY':
      return 'Cele dnia zmieniły się w międzyczasie. Odświeżono — spróbuj ponownie.';
    case 'NO_DAY_TODAY':
      return 'Nie znaleziono dnia. Odświeżono aktualny stan.';
    default:
      return 'Stan dnia się zmienił. Odświeżono aktualny stan.';
  }
}
