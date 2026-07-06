import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../lib/require-auth';

/**
 * GET /api/me — „kim jestem". Trasa chroniona (BE-5): gość → 401,
 * zalogowany → zwraca swojego użytkownika (z sesji Better Auth).
 */
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: requireAuth }, async (request) => {
    return { user: request.authSession?.user };
  });
};
