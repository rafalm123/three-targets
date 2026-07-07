import { useState, type ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { authClient, useSession } from '../lib/auth-client';
import { authErrorMessage, GENERIC_AUTH_ERROR } from '../lib/auth-errors';

/**
 * Ekran zalogowanego użytkownika (fundament, FE-3/FE-4/FE-5). Docelowo tu wejdą widoki dziennika
 * (Część 2). Na razie potwierdza działający cykl: pokazuje kim jesteś + pozwala się wylogować.
 */
export function HomePage(): ReactNode {
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut(): Promise<void> {
    setSignOutError(null);
    setSigningOut(true);
    // signOut zwraca { error } dla odpowiedzi HTTP, ale RZUCA przy awarii sieci → try/catch.
    // Po sukcesie useSession wyczyści sesję → ProtectedRoute przekieruje na /login.
    try {
      const { error } = await authClient.signOut();
      if (error) setSignOutError(authErrorMessage(error));
    } catch {
      setSignOutError(GENERIC_AUTH_ERROR);
    } finally {
      setSigningOut(false);
    }
  }

  const logoutButton = (
    <button
      type="button"
      className="button button-secondary"
      onClick={handleSignOut}
      disabled={signingOut}
    >
      {signingOut ? 'Wylogowywanie…' : 'Wyloguj'}
    </button>
  );

  return (
    <AppShell headerActions={logoutButton}>
      {signOutError ? (
        <div className="form-error" role="alert">
          {signOutError}
        </div>
      ) : null}
      <p>
        Zalogowano jako <strong>{session?.user.name ?? session?.user.email}</strong>.
      </p>
      <p>Widoki dziennika (rano/wieczór/historia) dojdą w kolejnej fazie.</p>
    </AppShell>
  );
}
