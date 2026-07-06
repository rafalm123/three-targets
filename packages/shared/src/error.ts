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
