import type { ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { EmptyState } from '../components/states';

/**
 * Widok „Historia" (FE-10) — na tym plastrze PLACEHOLDER. Pełna lista przeszłych dni
 * (`GET /api/days/history`) + podgląd szczegółu (`GET /api/days/:date`) dochodzi w Plastrze 3.
 * Trasa istnieje już teraz, by nawigacja Dziś/Historia (FE-6) działała end-to-end.
 */
export function HistoryPage(): ReactNode {
  // TODO FE-10: lista dni (keyset ?before=&limit=) + klik → szczegół dnia po dacie.
  return (
    <AppShell showNav>
      <EmptyState
        title="Historia"
        message="Przeglądanie poprzednich dni pojawi się wkrótce."
      />
    </AppShell>
  );
}
