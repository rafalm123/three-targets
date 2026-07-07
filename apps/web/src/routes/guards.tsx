import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorState, LoadingState } from '../components/states';
import { useSession } from '../lib/auth-client';

/**
 * Trasy chronione + przekierowania (FE-4).
 *
 * Sesja żyje w ciasteczku HttpOnly (same-origin), więc odświeżenie strony NIE wylogowuje —
 * `useSession` re-hydratuje stan z `/api/auth/get-session`. Podczas tego pierwszego pobrania
 * (`isPending`) pokazujemy Loading zamiast migać ekranem logowania i wyrzucać zalogowanego.
 */

/** Domyślna trasa po zalogowaniu, gdy nie ma zapamiętanej ścieżki źródłowej. */
const DEFAULT_AUTHED_PATH = '/';

/** Kształt stanu nawigacji przekazywanego przez ProtectedRoute do /login. */
interface FromLocationState {
  from?: string;
}

/** Gość → /login (z zapamiętaniem docelowej ścieżki). Zalogowany → renderuje trasę potomną. */
export function ProtectedRoute(): ReactNode {
  const { data: session, isPending, error, refetch } = useSession();
  const location = useLocation();

  if (isPending) return <LoadingState label="Sprawdzanie sesji…" />;
  // Błąd pobrania sesji (np. offline) — nie zakładamy zalogowania; pokazujemy błąd z akcją
  // ponowienia (refetch), a nie biały ekran.
  if (error) {
    return (
      <ErrorState
        message="Nie udało się sprawdzić sesji."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }
  if (!session) {
    // Zapamiętujemy pełną ścieżkę (z query), by po zalogowaniu wrócić dokładnie tu.
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={{ from } satisfies FromLocationState} />;
  }

  return <Outlet />;
}

/** Trasy tylko dla gościa (login/rejestracja). Zalogowany → wraca na zapamiętaną ścieżkę lub /. */
export function PublicOnlyRoute(): ReactNode {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) return <LoadingState label="Sprawdzanie sesji…" />;
  if (session) {
    // history.state to granica zaufania — walidujemy runtime, że `from` jest stringiem,
    // zamiast ślepo rzutować i przekazać cokolwiek do Navigate.
    const state = location.state as FromLocationState | null;
    const target = typeof state?.from === 'string' ? state.from : DEFAULT_AUTHED_PATH;
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
