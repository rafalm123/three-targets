import type { ReactNode } from 'react';

/**
 * Szkielet layoutu aplikacji (FE-5): nagłówek + główny obszar treści.
 *
 * Reużywalny shell dla widoków za loginem. `headerActions` pozwala wstrzyknąć akcje
 * kontekstowe (np. przycisk wylogowania) bez sprzęgania shella z logiką auth.
 */
export function AppShell({
  children,
  headerActions,
}: {
  children: ReactNode;
  headerActions?: ReactNode;
}): ReactNode {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Trzy Cele</h1>
        {headerActions ? <div>{headerActions}</div> : null}
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
