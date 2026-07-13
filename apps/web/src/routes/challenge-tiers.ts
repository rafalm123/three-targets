import type { ChallengeCreate, RewardTier } from '@trzy-cele/shared';

/**
 * Stałe progi 30-dniowego wyzwania — wielokrotności 10, rosnące, unikalne, ≤60 (kontrakt BE).
 * UI pokazuje wiersz na każdy próg; użytkownik wpisuje nagrodę tylko dla progów, które chce
 * odblokowywać. Progi bez nagrody są POMIJANE w wysyłanym `tiers` (nie wysyłamy pustych).
 */
export const TIER_THRESHOLDS = [10, 20, 30, 40, 50, 60] as const;

/** Robocze wartości formularza: mapa próg → wpisana nagroda (może być pusta). */
export type TierDraft = Record<number, string>;

/** Pusty szkic — wszystkie progi bez nagrody. */
export function emptyTierDraft(): TierDraft {
  return Object.fromEntries(TIER_THRESHOLDS.map((t) => [t, ''])) as TierDraft;
}

/**
 * Składa `tiers` do wysyłki z niepustych wierszy (trim). Zwraca progi rosnąco — zgodnie z kontraktem
 * (rosnące, unikalne, wielokrotności 10, ≤60; gwarantowane przez `TIER_THRESHOLDS`).
 */
export function buildTiers(draft: TierDraft): RewardTier[] {
  const tiers: RewardTier[] = [];
  for (const threshold of TIER_THRESHOLDS) {
    const reward = draft[threshold]?.trim();
    if (reward) tiers.push({ threshold, reward });
  }
  return tiers;
}

/**
 * Składa payload `ChallengeCreate` (tytuł opcjonalny — pusty pomijamy). Zwraca `null`, gdy nie ma
 * ani jednej niepustej nagrody — inwariant „min. 1 próg" (kontrakt `challengeCreateSchema.tiers.min(1)`)
 * jest egzekwowany W JEDNYM MIEJSCU tutaj, a wołający (formularz) tłumaczy `null` na komunikat.
 */
export function buildChallengeCreate(title: string, draft: TierDraft): ChallengeCreate | null {
  const tiers = buildTiers(draft);
  if (tiers.length === 0) return null;
  const trimmedTitle = title.trim();
  return {
    ...(trimmedTitle ? { title: trimmedTitle } : {}),
    tiers,
  };
}
