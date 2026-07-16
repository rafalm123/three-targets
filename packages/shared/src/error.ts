import { z } from 'zod';

/**
 * Spójny kształt odpowiedzi błędu API (BE-7). Wszystkie błędy z NASZYCH tras mają ten format;
 * FE może na nim polegać. (Trasy /api/auth/* zwracają własny format Better Auth — obsługiwane
 * przez klienta Better Auth po stronie FE.)
 */
export const apiErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Znane kody błędów domenowych zwracane przez NASZE trasy (poza formatem Better Auth).
 * Jedno miejsce referencyjne dla FE; `code` w `apiErrorSchema` pozostaje otwartym stringiem.
 */
export const errorCodes = {
  DAY_ALREADY_EXISTS: 'DAY_ALREADY_EXISTS',
  DAY_ALREADY_CLOSED: 'DAY_ALREADY_CLOSED',
  NO_DAY_TODAY: 'NO_DAY_TODAY',
  GOAL_NOT_IN_DAY: 'GOAL_NOT_IN_DAY',
  DAY_FROZEN: 'DAY_FROZEN',
  FUTURE_DATE: 'FUTURE_DATE',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];
