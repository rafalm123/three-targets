import { streakSchema } from '@trzy-cele/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { readStreak, resetStreak } from '../lib/stats-service';
import { getAuthSession, requireAuth } from '../lib/require-auth';

/**
 * BE-15/BE-18/BE-20 — licznik dni / seria. Warstwa trasy (cienka); logika w lib/stats-service.ts.
 *
 * `GET  /api/stats/streak`       → { current, longest, totalDays, asOfDate }.
 * `POST /api/stats/streak/reset` → jw. po ręcznym resecie (zeruje TYLKO current; longest/totalDays nietknięte).
 *
 * BE-18 — dzień liczy się ⇔ ma cel GŁÓWNY dowieziony (closed + main.completed=true); poboczne bez znaczenia.
 * BE-20 — reset ustawia `user.streakResetDate = dziś` (floor dla `current`). „Dziś" wyznacza serwer z `users.timezone`.
 * Kontrakt reset = ten sam `streakSchema` (bez osobnego typu odpowiedzi).
 */
export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/stats/streak',
    {
      preHandler: requireAuth,
      schema: { response: { 200: streakSchema } },
    },
    async (request) => {
      const { user } = getAuthSession(request);
      return readStreak(user.id, user.timezone);
    },
  );

  app.post(
    '/stats/streak/reset',
    {
      preHandler: requireAuth,
      schema: { response: { 200: streakSchema } },
    },
    async (request) => {
      const { user } = getAuthSession(request);
      return resetStreak(user.id, user.timezone);
    },
  );
};
