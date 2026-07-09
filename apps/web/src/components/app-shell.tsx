import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

/**
 * Szkielet layoutu aplikacji (FE-5, rozszerzony w FE-6): nagłówek + opcjonalna nawigacja + treść.
 *
 * Reużywalny shell dla widoków za loginem. `headerActions` wstrzykuje akcje kontekstowe (np.
 * wylogowanie) bez sprzęgania shella z auth. `showNav` włącza nawigację Dziś/Historia — ekrany
 * auth (login/rejestracja) jej NIE pokazują (użytkownik niezalogowany), więc domyślnie wyłączona.
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
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Trzy Cele</h1>
        {headerActions ? <div>{headerActions}</div> : null}
      </header>
      {showNav ? (
        <nav className="app-nav" aria-label="Główna nawigacja">
          <NavLink to="/" end className={navLinkClass}>
            Dziś
          </NavLink>
          <NavLink to="/historia" className={navLinkClass}>
            Historia
          </NavLink>
        </nav>
      ) : null}
      <main className="app-main">{children}</main>
    </div>
  );
}
