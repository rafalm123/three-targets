import { Prisma } from '@prisma/client';
import {
  type ApiError,
  apiErrorSchema,
  type Day,
  dayResponseSchema,
  daySchema,
  eveningEntrySchema,
  morningEntrySchema,
} from '@trzy-cele/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { userToday } from '../lib/day-boundary';
import { checkCanCloseDay } from '../lib/day-service';
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

  // BE-13 — pobranie dnia „dzisiaj" (data z timezone usera). Brak rekordu → { day: null }
  // (pierwszoklasowa odpowiedź, nie błąd) → FE kieruje do „wypełnij rano".
  app.get(
    '/days/today',
    {
      preHandler: requireAuth,
      schema: { response: { 200: dayResponseSchema } },
    },
    async (request) => {
      const { user } = getAuthSession(request);
      const date = userToday(user.timezone);
      const day = await prisma.day.findUnique({
        where: { userId_date: { userId: user.id, date } },
        include: { goals: { orderBy: { position: 'asc' } } },
      });
      return { day: day ? toDayResponse(day) : null };
    },
  );

  // BE-12 — wieczorne odznaczenie: oznacza każdy z 3 celów (dowieziony/nie + opcjonalna notatka),
  // zapisuje notatkę wieczorną i przełącza dzień evening_pending → closed. Reguły przejścia
  // (istnienie / niemutowalność closed / spójność celów) w checkCanCloseDay. Zapis atomowy (transakcja).
  app.post(
    '/days/today/evening',
    {
      preHandler: requireAuth,
      schema: {
        body: eveningEntrySchema,
        response: {
          200: daySchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { user } = getAuthSession(request);
      const body = request.body;
      const date = userToday(user.timezone);

      const day = await prisma.day.findUnique({
        where: { userId_date: { userId: user.id, date } },
        include: { goals: true },
      });

      const guard = checkCanCloseDay(day, body.goals.map((g) => g.id));
      if (!guard.ok) {
        const err: ApiError = { error: { message: guard.message, code: guard.code } };
        return reply.status(guard.status).send(err);
      }

      // guard.ok gwarantuje: dzień istnieje, evening_pending, a body.goals to dokładnie cele tego dnia.
      const updated = await prisma.$transaction(async (tx) => {
        for (const mark of body.goals) {
          await tx.goal.update({
            where: { id: mark.id },
            data: { completed: mark.completed, completedNote: mark.completedNote ?? null },
          });
        }
        return tx.day.update({
          where: { userId_date: { userId: user.id, date } },
          data: { eveningNote: body.eveningNote ?? null, status: 'closed' },
          include: { goals: { orderBy: { position: 'asc' } } },
        });
      });

      return reply.status(200).send(toDayResponse(updated));
    },
  );
};
