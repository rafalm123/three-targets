/**
 * Kalendarzowa arytmetyka na datach lokalnych `YYYY-MM-DD` (bez czasu i strefy). Kotwicą jest data
 * z serwera (`Day.date` lub `Streak.asOfDate`) — NIE liczymy „dziś"/„wczoraj" z lokalnego zegara
 * przeglądarki, bo granicę doby wyznacza serwer z `users.timezone`. Liczymy przez UTC, żeby przejścia
 * DST nie przesuwały wyniku (data traktowana jako północ UTC, jak po stronie BE `dateOnlyUtc`).
 */
export function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const base = Date.UTC(y ?? NaN, (m ?? 1) - 1, d ?? 1);
  return new Date(base + delta * 86_400_000).toISOString().slice(0, 10);
}

/** Poprzedni dzień kalendarzowy względem kotwicy (data z serwera). */
export function previousDayIso(anchor: string): string {
  return addDaysIso(anchor, -1);
}
