import { healthResponseSchema, type HealthResponse } from '@trzy-cele/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * GET /api/health — kontrakt walking skeletonu. Zwraca { status: 'ok' }.
 *
 * Health nie ma logiki domenowej ani dostępu do bazy, więc świadomie nie wprowadza
 * warstwy service/Prisma — konwencja route→handler→service→Prisma zaczyna obowiązywać
 * przy endpointach z realną logiką (BE-9+).
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        response: { 200: healthResponseSchema },
      },
    },
    async (): Promise<HealthResponse> => {
      return { status: 'ok' };
    },
  );
};
