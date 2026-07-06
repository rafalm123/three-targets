import { useState, type ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { authClient, useSession } from '../lib/auth-client';

/**
 * Ekran zalogowanego użytkownika (fundament, FE-3/FE-4/FE-5). Docelowo tu wejdą widoki dziennika
 * (Część 2). Na razie potwierdza działający cykl: pokazuje kim jesteś + pozwala się wylogować.
 */
export function HomePage(): ReactNode {
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    // Po wylogowaniu useSession wyczyści sesję → ProtectedRoute przekieruje na /login.
    await authClient.signOut();
    setSigningOut(false);
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
      <p>
        Zalogowano jako <strong>{session?.user.name ?? session?.user.email}</strong>.
      </p>
      <p>Widoki dziennika (rano/wieczór/historia) dojdą w kolejnej fazie.</p>
    </AppShell>
  );
}
