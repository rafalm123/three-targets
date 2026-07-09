import { useState, type ReactNode } from 'react';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, GENERIC_AUTH_ERROR } from '../lib/auth-errors';

/**
 * Przycisk „Wyloguj" — JEDNO źródło logiki wylogowania w całej apce (FE-12/NIT-1). Wcześniej
 * żył tylko w TodayPage; wyciągnięty tu, by był spójnie na wszystkich trasach za loginem
 * (renderowany przez AppShell przy `showNav`).
 *
 * `signOut` zwraca `{ error }` dla odpowiedzi HTTP, ale RZUCA przy awarii sieci (better-fetch nie
 * łapie wyjątku fetch) → try/catch. Po sukcesie `useSession` w guardach wyczyści sesję →
 * ProtectedRoute przekieruje na /login. Błąd pokazujemy inline pod przyciskiem (role=alert).
 */
export function LogoutButton(): ReactNode {
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut(): Promise<void> {
    setError(null);
    setSigningOut(true);
    try {
      const { error: signOutError } = await authClient.signOut();
      if (signOutError) setError(authErrorMessage(signOutError));
    } catch {
      setError(GENERIC_AUTH_ERROR);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button button-secondary"
        onClick={handleSignOut}
        disabled={signingOut}
      >
        {signingOut ? 'Wylogowywanie…' : 'Wyloguj'}
      </button>
      {error ? (
        <div className="form-error logout-error" role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}
