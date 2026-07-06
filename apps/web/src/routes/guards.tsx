import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingState } from '../components/states';
import { ErrorState } from '../components/states';
import { useSession } from '../lib/auth-client';

/**
 * Trasy chronione + przekierowania (FE-4).
 *
 * Sesja żyje w ciasteczku HttpOnly (same-origin), więc odświeżenie strony NIE wylogowuje —
 * `useSession` re-hydratuje stan z `/api/auth/get-session`. Podczas tego pierwszego pobrania
 * (`isPending`) pokazujemy Loading zamiast migać ekranem logowania i wyrzucać zalogowanego.
 */

/** Gość → /login (z zapamiętaniem docelowej ścieżki). Zalogowany → renderuje trasę potomną. */
export function ProtectedRoute(): ReactNode {
  const { data: session, isPending, error } = useSession();
  const location = useLocation();

  if (isPending) return <LoadingState label="Sprawdzanie sesji…" />;
  // Błąd pobrania sesji (np. offline) — nie zakładamy zalogowania; pokazujemy błąd, nie biały ekran.
  if (error) return <ErrorState message="Nie udało się sprawdzić sesji." />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <Outlet />;
}

/** Trasy tylko dla gościa (login/rejestracja). Zalogowany → apka (/). */
export function PublicOnlyRoute(): ReactNode {
  const { data: session, isPending } = useSession();

  if (isPending) return <LoadingState label="Sprawdzanie sesji…" />;
  if (session) return <Navigate to="/" replace />;

  return <Outlet />;
}
