import type { FastifyPluginAsync } from 'fastify';
import { getAuthSession, requireAuth } from '../lib/require-auth';

/**
 * GET /api/me — „kim jestem". Trasa chroniona (BE-5): gość → 401,
 * zalogowany → zwraca swojego użytkownika (z sesji Better Auth).
 */
export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: requireAuth }, async (request) => {
    // TODO(BE-6/FE-2): dodać zod response schema jako allowlistę pól (dziś payload jest czysty,
    // ale przyszłe additionalFields Better Auth wyciekłyby tu automatycznie).
    const { user } = getAuthSession(request);
    return { user };
  });
};
