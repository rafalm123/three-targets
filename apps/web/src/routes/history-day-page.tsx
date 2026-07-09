import type { Day } from '@trzy-cele/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { DayReadonlyView } from '../components/day-readonly';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { ApiRequestError, getDayByDate } from '../lib/api';
import { formatDate, isValidDateParam } from './history-format';

/**
 * Szczegół dnia jako DEDYKOWANA TRASA `/historia/:date` (FE-13, rekomendacja @sa). Data pochodzi
 * z `useParams()`, nie ze stanu lokalnego → refresh/deep-link odtwarza widok (pobiera
 * `getDayByDate`), a powrót działa natywnym back-buttonem przeglądarki. Read-only (z notatkami).
 *
 * Walidacja param `date`: zły format kalendarzowy → od razu stan błędu (bez wołania API). Po stronie
 * BE 400 (przyszła/niepoprawna data) to błąd TRWAŁY → komunikat BEZ „Spróbuj ponownie" (retry nic
 * nie da). Inne błędy (sieć/5xx/przejściowe) → ErrorState z retry. Brak wpisu → `{day:null}` →
 * EmptyState. W każdym przypadku jest link powrotu do `/historia` (żaden nie crashuje widoku).
 */

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error'; permanent: boolean }
  | { kind: 'ready'; day: Day | null };

export function HistoryDayPage(): ReactNode {
  const { date } = useParams<{ date: string }>();
  const valid = isValidDateParam(date);

  const [state, setState] = useState<DetailState>({ kind: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    if (!valid) return;
    setState({ kind: 'loading' });
    // getDayByDate rzuca ApiRequestError (HTTP !ok) lub surowy rzut fetch (awaria sieci).
    try {
      const { day } = await getDayByDate(date);
      setState({ kind: 'ready', day });
    } catch (err) {
      // 400 = data przyszła/niepoprawna kalendarzowo → błąd TRWAŁY (ponawianie nic nie zmieni).
      // Pozostałe (sieć/5xx) traktujemy jako przejściowe → damy retry.
      const permanent = err instanceof ApiRequestError && err.status === 400;
      setState({ kind: 'error', permanent });
    }
  }, [date, valid]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell showNav>
      {/* aria-label: przy niepoprawnym param NIE wstrzykujemy surowej wartości — neutralna etykieta. */}
      <section className="day-view" aria-label={valid ? `Dzień ${date}` : 'Szczegóły dnia'}>
        <Link to="/historia" className="button button-secondary back-button">
          ← Wróć do historii
        </Link>

        {valid ? (
          <header className="day-view-header">
            <h2>{formatDate(date)}</h2>
          </header>
        ) : null}

        {!valid ? (
          <EmptyState
            title="Nieprawidłowa data"
            message="Adres nie wskazuje poprawnego dnia. Wróć do historii i wybierz dzień z listy."
          />
        ) : null}

        {valid && state.kind === 'loading' ? <LoadingState label="Ładowanie dnia…" /> : null}

        {valid && state.kind === 'error' && state.permanent ? (
          // Trwały błąd (400) — bez retry: pokazujemy powód i kierujemy z powrotem do listy.
          <EmptyState
            title="Nie można wyświetlić tego dnia"
            message="Ta data jest nieprawidłowa lub z przyszłości. Wróć do historii i wybierz dzień z listy."
          />
        ) : null}

        {valid && state.kind === 'error' && !state.permanent ? (
          <ErrorState
            message="Nie udało się wczytać tego dnia."
            onRetry={() => {
              void load();
            }}
          />
        ) : null}

        {valid && state.kind === 'ready' && state.day === null ? (
          <EmptyState title="Brak wpisu" message="Na ten dzień nie ma zapisanego wpisu." />
        ) : null}

        {valid && state.kind === 'ready' && state.day !== null ? (
          <DayReadonlyView day={state.day} />
        ) : null}
      </section>
    </AppShell>
  );
}
