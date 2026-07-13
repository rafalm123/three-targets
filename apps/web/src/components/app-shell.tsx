import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { StreakBadge } from './streak-badge';
import { StreakReset } from './streak-reset';
import { StreakRefreshProvider } from './streak-refresh';
import { LogoutButton } from './logout-button';

/**
 * Szkielet layoutu aplikacji (FE-5, rozszerzony FE-6/FE-11/FE-12): nagłówek + opcjonalna
 * nawigacja + treść.
 *
 * `showNav` = ekran za loginem → shell sam dokłada globalny chrome: wskaźnik serii (`StreakBadge`),
 * reset serii (`StreakReset`, z dialogiem potwierdzenia — FE-C) i przycisk „Wyloguj"
 * (`LogoutButton`). Dzięki temu logout, streak i reset są spójne na WSZYSTKICH trasach za loginem
 * (Dziś/Historia) — bez duplikowania logiki w każdym widoku (FE-12/NIT-1). StreakReset korzysta
 * z tego samego `StreakRefreshProvider` co badge, więc po resecie licznik odświeża się od razu.
 * Ekrany auth (login/rejestracja) mają `showNav=false` → brak nawigacji, logoutu i streaka.
 *
 * `headerActions` pozwala widokowi dołożyć własne akcje kontekstowe obok globalnych.
 */

/** react-router v7 nie dokłada klasy `active` przy stringowym `className` — dajemy ją jawnie. */
function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'app-nav-link active' : 'app-nav-link';
}

export function AppShell({
  children,
  headerActions,
  showNav = false,
}: {
  children: ReactNode;
  headerActions?: ReactNode;
  showNav?: boolean;
}): ReactNode {
  const shell = (
    <div className="app-shell">
      <header className="app-header">
        <h1>Trzy Cele</h1>
        <div className="app-header-actions">
          {showNav ? <StreakBadge /> : null}
          {showNav ? <StreakReset /> : null}
          {headerActions}
          {showNav ? <LogoutButton /> : null}
        </div>
      </header>
      {showNav ? (
        <nav className="app-nav" aria-label="Główna nawigacja">
          <NavLink to="/" end className={navLinkClass}>
            Dziś
          </NavLink>
          <NavLink to="/cele" className={navLinkClass}>
            Lista celów
          </NavLink>
          <NavLink to="/historia" className={navLinkClass}>
            Historia
          </NavLink>
        </nav>
      ) : null}
      <main className="app-main">{children}</main>
    </div>
  );

  // Odświeżanie serii wiąże StreakBadge (nagłówek) z widokiem (treść) — oba pod jednym providerem.
  // Tylko dla ekranów za loginem (showNav); auth-ekrany nie mają ani streaka, ani mutacji dnia.
  return showNav ? <StreakRefreshProvider>{shell}</StreakRefreshProvider> : shell;
}
