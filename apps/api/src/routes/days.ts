import { Prisma } from '@prisma/client';
import { type ApiError, apiErrorSchema, type Day, daySchema, morningEntrySchema } from '@trzy-cele/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { userToday } from '../lib/day-boundary';
import { prisma } from '../lib/prisma';
import { getAuthSession, requireAuth } from '../lib/require-auth';

type DayWithGoals = Prisma.DayGetPayload<{ include: { goals: true } }>;

function toDayResponse(day: DayWithGoals): Day {
  return {
    id: day.id,
    date: day.date.toISOString().slice(0, 10), // YYYY-MM-DD (data zapisana jako północ UTC)
    status: day.status,
    morningNote: day.morningNote,
    eveningNote: day.eveningNote,
    goals: day.goals.map((g) => ({
      id: g.id,
      kind: g.kind,
      position: g.position,
      title: g.title,
      note: g.note,
      completed: g.completed,
      completedNote: g.completedNote,
    })),
  };
}

/**
 * BE-10 — zapis porannego wpisu. `POST /api/days`: tworzy dzień „dzisiaj" (data z timezone usera)
 * z 1 celem głównym + 2 pobocznymi. Walidacja kształtu (dokładnie 1+2) przez zod; „jeden wpis na
 * dzień" gwarantuje unikat `(userId, date)` → duplikat = 409. Po zapisie status = evening_pending.
 */
export const dayRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/days',
    {
      preHandler: requireAuth,
      schema: {
        body: morningEntrySchema,
        response: { 201: daySchema, 409: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { user } = getAuthSession(request);
      const body = request.body;
      const date = userToday(user.timezone);

      const goalsData = [
        { kind: 'main' as const, position: 0, title: body.main.title, note: body.main.note ?? null },
        ...body.secondary.map((g, i) => ({
          kind: 'secondary' as const,
          position: i + 1,
          title: g.title,
          note: g.note ?? null,
        })),
      ];

      try {
        const day = await prisma.day.create({
          data: {
            userId: user.id,
            date,
            morningNote: body.morningNote ?? null,
            status: 'evening_pending',
            goals: { create: goalsData },
          },
          include: { goals: { orderBy: { position: 'asc' } } },
        });
        return await reply.status(201).send(toDayResponse(day));
      } catch (err) {
        // 409 tylko dla konfliktu unikatu dnia (userId, date); inne P2002 → rzuć dalej (→ 500).
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          String(err.meta?.target ?? '').includes('date')
        ) {
          const conflict: ApiError = {
            error: { message: 'Wpis na dziś już istnieje', code: 'DAY_ALREADY_EXISTS' },
          };
          return await reply.status(409).send(conflict);
        }
        throw err;
      }
    },
  );
};
