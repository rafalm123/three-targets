import { type Streak, streakSchema } from '@trzy-cele/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { localDateInTimeZone } from '../lib/day-boundary';
import { prisma } from '../lib/prisma';
import { getAuthSession, requireAuth } from '../lib/require-auth';
import { computeStreak } from '../lib/streak';

/**
 * BE-15 — licznik dni / seria. `GET /api/stats/streak` → { current, longest, totalDays, asOfDate }.
 * Liczone on-the-fly z `days` (dzień liczony = `closed`); definicja serii w computeStreak (@sa).
 * „Dziś" (asOfDate) wyznacza serwer z `users.timezone`.
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
      const asOfDate = localDateInTimeZone(new Date(), user.timezone);

      const rows = await prisma.day.findMany({
        where: { userId: user.id, status: 'closed' },
        select: { date: true },
      });
      const closedDates = rows.map((r) => r.date.toISOString().slice(0, 10));

      const { current, longest, totalDays } = computeStreak(closedDates, asOfDate);
      const result: Streak = { current, longest, totalDays, asOfDate };
      return result;
    },
  );
};
