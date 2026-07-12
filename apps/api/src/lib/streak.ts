import { addDaysIso } from './day-boundary';

/**
 * Czysta logika licznika dni / serii (BE-15/BE-18) — najłatwiejsze miejsce na bugi (granice,
 * dni kalendarzowe), więc wydzielona i testowana bez DB. Definicja serii wg @sa.
 *
 * BE-18: zbiór wejściowy to daty dni z DOWIEZIONYM celem głównym (nie „wszystkie closed") —
 * filtr robi wywołujący (query w stats.ts). Logika ciągów tu bez zmian.
 *
 * BE-20: opcjonalny `floorDate` (ręczny reset serii) dotyczy WYŁĄCZNIE `current` — cofając wstecz
 * zatrzymuje się na dniach `< floorDate` (dni sprzed resetu nie liczą się do bieżącej serii).
 * `longest`/`totalDays` liczone z pełnego zbioru, bez floora.
 *
 * @param qualifyingDates daty (`YYYY-MM-DD`) dni liczących się do serii = closed z main.completed
 *                        (unikalne per user)
 * @param today           lokalna data „dziś" (serwer, z `users.timezone`)
 * @param floorDate       (opcj.) `YYYY-MM-DD` — dolna granica dla `current`; dni `< floorDate` nie liczą się
 */
export function computeStreak(
  qualifyingDates: readonly string[],
  today: string,
  floorDate?: string,
): { current: number; longest: number; totalDays: number } {
  const set = new Set(qualifyingDates);
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

  // current: wstecz od „dziś"; „dziś" w toku (bez dowiezionego głównego) nie zrywa serii → start od wczoraj.
  // BE-20: floorDate ucina serię — nie liczymy dni `< floorDate` (porównanie leksykograficzne = kalendarzowe).
  let cursor = set.has(today) ? today : addDaysIso(today, -1);
  let current = 0;
  while (set.has(cursor) && (floorDate === undefined || cursor >= floorDate)) {
    current += 1;
    cursor = addDaysIso(cursor, -1);
  }

  return { current, longest, totalDays };
}
