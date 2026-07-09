/**
 * Wspólne helpery prezentacji historii — współdzielone przez listę (`HistoryPage`) i szczegół
 * dnia jako trasa (`HistoryDayPage`, FE-13).
 */

/** `YYYY-MM-DD` → czytelna data PL. Parsujemy jako lokalną (bez przesunięcia strefy). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Klasa CSS flagi dowiezienia celu (✓/✗/–). */
export function flagClass(c: boolean | null): string {
  if (c === null) return 'history-flag-none';
  return c ? 'history-flag-done' : 'history-flag-missed';
}

/** Zagregowana etykieta a11y dla flag celów (czytnik: „Dowiezione X z N celów"). */
export function goalsAriaLabel(flags: (boolean | null)[]): string {
  const done = flags.filter((f) => f === true).length;
  const total = flags.length;
  return `Dowiezione ${done} z ${total} celów`;
}

/**
 * Front-side sanity dla param trasy `:date` — poprawny kalendarzowo `YYYY-MM-DD`. Przy złym
 * formacie nie wołamy API (BE i tak odrzuci), tylko od razu pokazujemy błąd z linkiem powrotu.
 * (Regex sam przepuszcza `2020-02-31` → weryfikujemy round-trip przez `Date`.)
 */
export function isValidDateParam(date: string | undefined): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(y!, m! - 1, d!);
  return (
    parsed.getFullYear() === y && parsed.getMonth() === m! - 1 && parsed.getDate() === d
  );
}
