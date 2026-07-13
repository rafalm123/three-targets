/**
 * Czysta logika punktów wyzwania (BE-P2) — najłatwiejsze miejsce na bugi (granice okna,
 * warunki completed), więc wydzielona i testowana bez DB (jak `streak.ts`).
 *
 * MODEL PUNKTÓW (Faza 2, finalny, BEZ KAR): poboczny wykonany = +1 (każdy, max +2/dzień),
 * główny = 0 (bez znaczenia), ZERO odejmowania. Punkty tylko rosną.
 *
 * DERYWACJA (decyzja @sa): punkty liczone on-the-fly z `days`/`goals` — NIE ma tabeli
 * `point_events` (ledger wraca dopiero w Fazie 3). `totalPoints` = liczba celów
 * `kind='secondary', completed=true` w dniach usera z `date` w oknie [startDate, min(today, endDate)].
 * Dzień pominięty / niezamknięty / dziś w toku → poboczne nie są `completed` → 0 wkładu. Bez negatywów.
 *
 * Porównania dat: leksykograficzne `YYYY-MM-DD` == kalendarzowe (spójne z day-boundary).
 */

/** Minimalny cel na wejściu logiki punktów (kind + flaga completed). */
export interface ChallengeGoalInput {
  kind: 'main' | 'secondary';
  completed: boolean | null;
}

/** Minimalny dzień na wejściu logiki punktów (data lokalna + cele). */
export interface ChallengeDayInput {
  date: string; // YYYY-MM-DD
  goals: ChallengeGoalInput[];
}

/** Okno wyzwania + „dziś" (wszystko jako lokalne daty `YYYY-MM-DD`). */
export interface PointsWindow {
  startDate: string;
  endDate: string;
  today: string;
}

/** Próg nagrody (wejście — bez stanu). */
export interface TierInput {
  threshold: number;
  reward: string;
}

/** Próg nagrody ze stanem odblokowania (wyjście). */
export interface TierState extends TierInput {
  unlocked: boolean;
}

/** Wynik pełnego wyliczenia punktów + progów. */
export interface ChallengePoints {
  totalPoints: number;
  nextThreshold: number | null;
  pointsToNext: number | null;
  tiers: TierState[];
}

/**
 * Liczy `totalPoints` = suma pobocznych `completed=true` w dniach, których `date`
 * mieści się w oknie [startDate, min(today, endDate)] (granice włącznie).
 */
export function countPoints(days: readonly ChallengeDayInput[], window: PointsWindow): number {
  // Górna granica okna to min(today, endDate) — dni z przyszłości i po końcu wyzwania nie liczą.
  const upperBound = window.today < window.endDate ? window.today : window.endDate;
  let total = 0;
  for (const d of days) {
    if (d.date < window.startDate || d.date > upperBound) continue;
    for (const g of d.goals) {
      if (g.kind === 'secondary' && g.completed === true) total += 1;
    }
  }
  return total;
}

/**
 * Wyznacza stan progów względem `total`:
 * - `unlocked` = threshold ≤ total (odblokowany dokładnie przy równości),
 * - `nextThreshold` = najmniejszy próg ściśle > total (albo null gdy brak),
 * - `pointsToNext` = ile brakuje do `nextThreshold` (albo null).
 * Kolejność `tiers` w wyniku = kolejność wejścia (serwis podaje je już posortowane).
 */
export function resolveTiers(total: number, tiers: readonly TierInput[]): {
  tiers: TierState[];
  nextThreshold: number | null;
  pointsToNext: number | null;
} {
  const withState: TierState[] = tiers.map((t) => ({
    threshold: t.threshold,
    reward: t.reward,
    unlocked: t.threshold <= total,
  }));
  // Najmniejszy próg ściśle > total (odporne na kolejność wejścia: sortujemy, potem find).
  const nextThreshold =
    tiers
      .map((t) => t.threshold)
      .filter((th) => th > total)
      .sort((a, b) => a - b)
      .find(() => true) ?? null;
  const pointsToNext = nextThreshold === null ? null : nextThreshold - total;
  return { tiers: withState, nextThreshold, pointsToNext };
}

/** Składa `countPoints` + `resolveTiers` w jeden wynik `ChallengePoints`. */
export function computeChallengePoints(
  days: readonly ChallengeDayInput[],
  window: PointsWindow,
  tiers: readonly TierInput[],
): ChallengePoints {
  const totalPoints = countPoints(days, window);
  const { tiers: tierStates, nextThreshold, pointsToNext } = resolveTiers(totalPoints, tiers);
  return { totalPoints, nextThreshold, pointsToNext, tiers: tierStates };
}
