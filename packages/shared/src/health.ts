import { z } from 'zod';

/**
 * Kontrakt endpointu zdrowia (walking skeleton).
 * BE-1 serwuje odpowiedź zgodną z tym schematem, FE-1 ją konsumuje.
 */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
