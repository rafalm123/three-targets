import type { DaySummary } from '@trzy-cele/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { getHistory } from '../lib/api';
import { flagClass, formatDate, goalsAriaLabel } from './history-format';

/**
 * Widok „Historia / dziennik" (FE-10). Lista przeszłych dni od najnowszych (`GET /days/history`,
 * bez „dziś", bez pełnych notatek — tylko `DaySummary`). Stronicowanie **keyset** przez `nextCursor`
 * z przyciskiem „Pokaż starsze" (proste i testowalne; bez infinite scroll).
 *
 * Klik w dzień → nawigacja do dedykowanej trasy `/historia/:date` (FE-13) — szczegół jest osobnym
 * widokiem (`HistoryDayPage`), więc deep-link/refresh/back-button działają natywnie.
 *
 * TRADE-OFF (MVP): powrót z `/historia/:date` remontuje ten komponent → lista i paginacja
 * resetują się do pierwszej strony. Świadomie akceptowane — zachowanie stanu listy między
 * nawigacjami (cache/context) jest poza zakresem FE-13.
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
                <HistoryRow item={item} />
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

/** Wiersz listy: data, status, tytuł głównego + flagi 3 celów. Link → szczegół `/historia/:date`. */
function HistoryRow({ item }: { item: DaySummary }): ReactNode {
  return (
    <Link to={`/historia/${item.date}`} className="history-row">
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
      <span className="history-flags" role="img" aria-label={goalsAriaLabel(item.goalsCompleted)}>
        {item.goalsCompleted.map((c, i) => (
          <span key={i} className={`history-flag ${flagClass(c)}`} aria-hidden="true">
            {c === null ? '–' : c ? '✓' : '✗'}
          </span>
        ))}
      </span>
    </Link>
  );
}
