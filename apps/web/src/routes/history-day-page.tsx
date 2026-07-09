import type { Day } from '@trzy-cele/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { DayReadonlyView } from '../components/day-readonly';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { getDayByDate } from '../lib/api';
import { formatDate, isValidDateParam } from './history-format';

/**
 * Szczegół dnia jako DEDYKOWANA TRASA `/historia/:date` (FE-13, rekomendacja @sa). Data pochodzi
 * z `useParams()`, nie ze stanu lokalnego → refresh/deep-link odtwarza widok (pobiera
 * `getDayByDate`), a powrót działa natywnym back-buttonem przeglądarki. Read-only (z notatkami).
 *
 * Walidacja param `date`: zły format kalendarzowy → od razu stan błędu (bez wołania API). Przyszła
 * data / niepoprawna po stronie BE → 400 → ErrorState; brak wpisu → `{day:null}` → EmptyState.
 * W każdym przypadku jest link powrotu do `/historia` (żaden nie crashuje widoku).
 */

type DetailState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; day: Day | null };

export function HistoryDayPage(): ReactNode {
  const { date } = useParams<{ date: string }>();
  const valid = isValidDateParam(date);

  const [state, setState] = useState<DetailState>({ kind: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    if (!valid) return;
    setState({ kind: 'loading' });
    // getDayByDate rzuca ApiRequestError (HTTP !ok, np. 400 dla przyszłej daty) lub surowy rzut
    // fetch (awaria sieci) — obie ścieżki → ErrorState (nie crash), z linkiem powrotu w nagłówku.
    try {
      const { day } = await getDayByDate(date);
      setState({ kind: 'ready', day });
    } catch {
      setState({ kind: 'error' });
    }
  }, [date, valid]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell showNav>
      <section className="day-view" aria-label={`Dzień ${date ?? ''}`}>
        <Link to="/historia" className="button button-secondary back-button">
          ← Wróć do historii
        </Link>

        <header className="day-view-header">
          <h2>{valid ? formatDate(date) : 'Nieprawidłowa data'}</h2>
        </header>

        {!valid ? (
          <EmptyState
            title="Nieprawidłowa data"
            message="Adres nie wskazuje poprawnego dnia. Wróć do historii i wybierz dzień z listy."
          />
        ) : null}

        {valid && state.kind === 'loading' ? <LoadingState label="Ładowanie dnia…" /> : null}

        {valid && state.kind === 'error' ? (
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
