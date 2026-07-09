import type { Day, DaySummary } from '@trzy-cele/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { DayReadonlyView } from '../components/day-readonly';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { getDayByDate, getHistory } from '../lib/api';

/**
 * Widok „Historia / dziennik" (FE-10). Lista przeszłych dni od najnowszych (`GET /days/history`,
 * bez „dziś", bez pełnych notatek — tylko `DaySummary`). Stronicowanie **keyset** przez `nextCursor`
 * z przyciskiem „Pokaż starsze" (proste i testowalne; bez infinite scroll).
 *
 * Klik w dzień → szczegół read-only (`GET /days/:date` — pełny dzień z notatkami). Szczegół to
 * lokalny stan (nie osobna trasa) — dla prywatnej apki 1-user deep-link historii to nadmiar;
 * decyzja odnotowana w PR.
 */

/** Stan listy historii. */
type ListState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: DaySummary[]; nextCursor: string | null };

export function HistoryPage(): ReactNode {
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const loadFirst = useCallback(async (): Promise<void> => {
    setList({ kind: 'loading' });
    try {
      const { items, nextCursor } = await getHistory();
      setList({ kind: 'ready', items, nextCursor });
    } catch {
      setList({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  async function loadMore(): Promise<void> {
    if (list.kind !== 'ready' || !list.nextCursor) return;
    setLoadingMore(true);
    try {
      const { items, nextCursor } = await getHistory(list.nextCursor);
      setList((prev) =>
        prev.kind === 'ready'
          ? { kind: 'ready', items: [...prev.items, ...items], nextCursor }
          : prev,
      );
    } catch {
      // Błąd doładowania nie wywala już wczytanej listy — pokazujemy go tylko przy przycisku.
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  // Szczegół wybranego dnia — nakładka read-only nad listą.
  if (selectedDate) {
    return (
      <AppShell showNav>
        <DayDetail date={selectedDate} onBack={() => setSelectedDate(null)} />
      </AppShell>
    );
  }

  return (
    <AppShell showNav>
      <h2 className="page-title">Historia</h2>

      {list.kind === 'loading' ? <LoadingState label="Ładowanie historii…" /> : null}

      {list.kind === 'error' ? (
        <ErrorState
          message="Nie udało się wczytać historii."
          onRetry={() => {
            void loadFirst();
          }}
        />
      ) : null}

      {list.kind === 'ready' && list.items.length === 0 ? (
        <EmptyState
          title="Brak historii"
          message="Zamknięte dni pojawią się tutaj, gdy zaczniesz podsumowywać wieczory."
        />
      ) : null}

      {list.kind === 'ready' && list.items.length > 0 ? (
        <>
          <ul className="history-list">
            {list.items.map((item) => (
              <li key={item.date}>
                <HistoryRow item={item} onOpen={() => setSelectedDate(item.date)} />
              </li>
            ))}
          </ul>

          {loadMoreError ? (
            <div className="form-error" role="alert">
              Nie udało się doładować starszych dni. Spróbuj ponownie.
            </div>
          ) : null}

          {list.nextCursor ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setLoadMoreError(false);
                void loadMore();
              }}
              disabled={loadingMore}
            >
              {loadingMore ? 'Ładowanie…' : 'Pokaż starsze'}
            </button>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}

/** Wiersz listy: data, status, tytuł głównego + flagi dowiezienia 3 celów. Klik → szczegół. */
function HistoryRow({ item, onOpen }: { item: DaySummary; onOpen: () => void }): ReactNode {
  return (
    <button type="button" className="history-row" onClick={onOpen}>
      {/* span (nie div) — element blokowy w <button> byłby niewalidnym HTML (CR NIT-3). */}
      <span className="history-row-head">
        <time className="history-date" dateTime={item.date}>
          {formatDate(item.date)}
        </time>
        <span className={`day-badge${item.status === 'closed' ? ' day-badge-closed' : ''}`}>
          {item.status === 'closed' ? 'Zamknięty' : 'W toku'}
        </span>
      </span>
      <span className="history-main-title">{item.mainTitle}</span>
      {/* role="img" + aria-label → czytnik odczyta zagregowane „Dowiezione X z 3" zamiast
          symboli ✓/✗/– (te są aria-hidden). (CR NIT-4) */}
      <span
        className="history-flags"
        role="img"
        aria-label={goalsAriaLabel(item.goalsCompleted)}
      >
        {item.goalsCompleted.map((c, i) => (
          <span key={i} className={`history-flag ${flagClass(c)}`} aria-hidden="true">
            {c === null ? '–' : c ? '✓' : '✗'}
          </span>
        ))}
      </span>
    </button>
  );
}

/** Szczegół dnia po dacie — pełny read-only (z notatkami). */
function DayDetail({ date, onBack }: { date: string; onBack: () => void }): ReactNode {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; day: Day | null }
  >({ kind: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const { day } = await getDayByDate(date);
      setState({ kind: 'ready', day });
    } catch {
      setState({ kind: 'error' });
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="day-view" aria-label={`Dzień ${date}`}>
      <button type="button" className="button button-secondary back-button" onClick={onBack}>
        ← Wróć do historii
      </button>

      <header className="day-view-header">
        <h2>{formatDate(date)}</h2>
      </header>

      {state.kind === 'loading' ? <LoadingState label="Ładowanie dnia…" /> : null}

      {state.kind === 'error' ? (
        <ErrorState
          message="Nie udało się wczytać tego dnia."
          onRetry={() => {
            void load();
          }}
        />
      ) : null}

      {state.kind === 'ready' && state.day === null ? (
        <EmptyState title="Brak wpisu" message="Na ten dzień nie ma zapisanego wpisu." />
      ) : null}

      {state.kind === 'ready' && state.day !== null ? <DayReadonlyView day={state.day} /> : null}
    </section>
  );
}

/** `YYYY-MM-DD` → czytelna data PL. Parsujemy jako lokalną (bez przesunięcia strefy). */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function flagClass(c: boolean | null): string {
  if (c === null) return 'history-flag-none';
  return c ? 'history-flag-done' : 'history-flag-missed';
}

function goalsAriaLabel(flags: (boolean | null)[]): string {
  const done = flags.filter((f) => f === true).length;
  const total = flags.length;
  return `Dowiezione ${done} z ${total} celów`;
}
