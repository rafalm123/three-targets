import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Lekki kontekst odświeżania wskaźnika serii (CR NIT-1). `StreakBadge` fetchuje na mount, ale
 * seria rośnie w momencie zamknięcia dnia (`submitEvening` → `closed`) — to moment nagrody, po
 * który ten wskaźnik istnieje. Zamiast propsdrillingu przez HUB → EveningForm, dostarczamy z
 * `AppShell` prosty licznik `refreshKey` + `bumpStreak()`: widok po sukcesie woła `bumpStreak`,
 * `StreakBadge` re-fetchuje, gdy `refreshKey` się zmienia.
 *
 * Poza providerem (np. ekrany auth) hook degraduje do no-op — brak wymogu obecności shella.
 */
interface StreakRefreshValue {
  /** Zmienia się przy każdym `bumpStreak` — StreakBadge trzyma go w deps efektu fetchującego. */
  refreshKey: number;
  /** Wymusza ponowne pobranie serii (po zamknięciu dnia). */
  bumpStreak: () => void;
}

const StreakRefreshContext = createContext<StreakRefreshValue>({
  refreshKey: 0,
  bumpStreak: () => {},
});

export function StreakRefreshProvider({ children }: { children: ReactNode }): ReactNode {
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpStreak = useCallback(() => setRefreshKey((k) => k + 1), []);
  const value = useMemo(() => ({ refreshKey, bumpStreak }), [refreshKey, bumpStreak]);
  return <StreakRefreshContext.Provider value={value}>{children}</StreakRefreshContext.Provider>;
}

/** Dostęp do odświeżania serii. Poza providerem = no-op (bezpieczne). */
export function useStreakRefresh(): StreakRefreshValue {
  return useContext(StreakRefreshContext);
}
