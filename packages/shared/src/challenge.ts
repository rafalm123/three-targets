import { z } from 'zod';

/**
 * Kontrakty „Listy celów" = 30-dniowego wyzwania punktowego (Faza 2, BE-P3).
 * Jedno źródło prawdy FE↔BE. Punkty liczone DERYWACYJNIE z `days`/`goals` (bez ledgera do Fazy 3).
 *
 * MODEL PUNKTÓW (finalny, BEZ KAR): poboczny wykonany = +1 (max +2/dzień), główny = 0, zero odejmowania.
 * Okno wyzwania = 30 dni → teoretyczne max 60 pkt → progi są wielokrotnością 10 w zakresie 10..60.
 */

/** Próg nagrody: przy `threshold` punktach odblokowuje się `reward`. Próg = int, %10, 10..60. */
export const rewardTierSchema = z.object({
  threshold: z
    .number()
    .int()
    .min(10)
    .max(60)
    .refine((n) => n % 10 === 0, 'Próg musi być wielokrotnością 10'),
  reward: z.string().trim().min(1).max(200),
});
export type RewardTier = z.infer<typeof rewardTierSchema>;

/** Próg nagrody ze stanem odblokowania (odpowiedź API). */
export const rewardTierStateSchema = rewardTierSchema.extend({
  unlocked: z.boolean(),
});
export type RewardTierState = z.infer<typeof rewardTierStateSchema>;

/** Progi muszą być ŚCIŚLE ROSNĄCE (implikuje unikalność). Wspólny refine dla create/update. */
function strictlyIncreasing(tiers: readonly RewardTier[]): boolean {
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1];
    const cur = tiers[i];
    if (!prev || !cur || cur.threshold <= prev.threshold) return false;
  }
  return true;
}

/** Utworzenie wyzwania: opcjonalny NIEPUSTY tytuł + min. 1 próg (unikalne, ściśle rosnące, ≤60). */
export const challengeCreateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  tiers: z
    .array(rewardTierSchema)
    .min(1)
    .refine(strictlyIncreasing, 'Progi muszą być ściśle rosnące (unikalne, uporządkowane)'),
});
export type ChallengeCreate = z.infer<typeof challengeCreateSchema>;

/**
 * Edycja wyzwania (MAJOR 1 — TRI-STATE tytułu, semantyka PATCH nie PUT):
 * - `title` POMINIĘTY (undefined) → tytuł BEZ ZMIAN,
 * - `title = null` → JAWNIE wyczyść tytuł,
 * - `title = string` (niepusty) → ustaw.
 * `tiers` WYMAGANE = pełne zastąpienie progów (spójne z „PATCH poranka = pełne zastąpienie" z dni).
 * Świadomie różny od create (nullable title) → osobny schemat, NIE alias.
 */
export const challengeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).nullable().optional(),
  tiers: z
    .array(rewardTierSchema)
    .min(1)
    .refine(strictlyIncreasing, 'Progi muszą być ściśle rosnące (unikalne, uporządkowane)'),
});
export type ChallengeUpdate = z.infer<typeof challengeUpdateSchema>;

/** Wyzwanie (odpowiedź bazowa). `startDate`/`endDate` jako `YYYY-MM-DD`, `createdAt` jako ISO. */
export const challengeSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.iso.datetime(), // NIT 8: z.string().datetime() deprecated w zod v4
});
export type Challenge = z.infer<typeof challengeSchema>;

/** Wyzwanie z policzonymi punktami i stanem progów (odpowiedź create/active/:id/patch). */
export const challengeWithPointsSchema = challengeSchema.extend({
  totalPoints: z.number().int().nonnegative(),
  nextThreshold: z.number().int().nullable(),
  pointsToNext: z.number().int().nullable(),
  tiers: z.array(rewardTierStateSchema),
});
export type ChallengeWithPoints = z.infer<typeof challengeWithPointsSchema>;

/**
 * Odpowiedź „pobierz aktywne / po id": wyzwanie z punktami albo `null` (brak / nie własne).
 * Jeden kształt dla `GET /active` i `GET /:id` (FE używa go dla obu — patrz apps/web/src/lib/api.ts).
 */
export const challengeResponseSchema = z.object({
  challenge: challengeWithPointsSchema.nullable(),
});
export type ChallengeResponse = z.infer<typeof challengeResponseSchema>;

/** Podsumowanie wyzwania w historii (zakończone) — bez progów, z sumą punktów. */
export const challengeSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalPoints: z.number().int().nonnegative(),
});
export type ChallengeSummary = z.infer<typeof challengeSummarySchema>;

/** Lista historii (zakończone wyzwania, od najnowszych). */
export const challengeListSchema = z.object({
  items: z.array(challengeSummarySchema),
});
export type ChallengeList = z.infer<typeof challengeListSchema>;
