import { addDaysIso } from './day-boundary';

/**
 * Czysta logika licznika dni / serii (BE-15) — najłatwiejsze miejsce na bugi (granice,
 * dni kalendarzowe), więc wydzielona i testowana bez DB. Definicja serii wg @sa.
 *
 * @param closedDates daty (`YYYY-MM-DD`) dni ze statusem `closed` (unikalne per user)
 * @param today       lokalna data „dziś" (serwer, z `users.timezone`)
 */
export function computeStreak(
  closedDates: readonly string[],
  today: string,
): { current: number; longest: number; totalDays: number } {
  const set = new Set(closedDates);
  const totalDays = set.size;

  // longest: dla każdej daty będącej POCZĄTKIem serii (brak poprzedniego dnia) mierz długość w przód.
  let longest = 0;
  for (const d of set) {
    if (set.has(addDaysIso(d, -1))) continue; // nie początek serii
    let len = 1;
    let cur = d;
    while (set.has(addDaysIso(cur, 1))) {
      len += 1;
      cur = addDaysIso(cur, 1);
    }
    if (len > longest) longest = len;
  }

  // current: wstecz od „dziś"; „dziś" w toku (≠closed) nie zrywa serii → start od wczoraj.
  let cursor = set.has(today) ? today : addDaysIso(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = addDaysIso(cursor, -1);
  }

  return { current, longest, totalDays };
}
