import { Prisma } from '@prisma/client';
import {
  type ApiError,
  apiErrorSchema,
  type Day,
  dayHistoryQuerySchema,
  dayHistorySchema,
  dayResponseSchema,
  daySchema,
  type DaySummary,
  eveningEntrySchema,
  morningEntrySchema,
} from '@trzy-cele/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { dateOnlyUtc, localDateInTimeZone, userToday } from '../lib/day-boundary';
import { checkCanCloseDay, checkDayMutable } from '../lib/day-service';
import { prisma } from '../lib/prisma';
import { getAuthSession, requireAuth } from '../lib/require-auth';

type DayWithGoals = Prisma.DayGetPayload<{ include: { goals: true } }>;

/** Sygnał wewnętrzny: dzień zamknięto równolegle (wyścig) → rollback transakcji, mapowany na 409. */
class DayAlreadyClosedError extends Error {}

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

/** Podsumowanie dnia do historii (BE-14) — bez pełnych notatek; flagi completed wg pozycji. */
function toDaySummary(day: DayWithGoals): DaySummary {
  const main = day.goals.find((g) => g.kind === 'main');
  return {
    date: day.date.toISOString().slice(0, 10),
    status: day.status,
    mainTitle: main?.title ?? '',
    goalsCompleted: day.goals.map((g) => g.completed),
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

  // BE-14 — historia dni: przeszłe dni (date < „dziś") od najnowszych, keyset po dacie.
  // Podsumowania bez pełnych notatek (decyzja @sa). `?before=YYYY-MM-DD` = kursor, `?limit=` (≤100, dom. 30).
  app.get(
    '/days/history',
    {
      preHandler: requireAuth,
      schema: { querystring: dayHistoryQuerySchema, response: { 200: dayHistorySchema } },
    },
    async (request) => {
      const { user } = getAuthSession(request);
      const { before, limit } = request.query;
      const today = userToday(user.timezone);
      // „Przeszłe" = ściśle przed dziś; kursor `before` cofa dalej (cap na dziś chroni przed obejściem).
      const beforeCandidate = before ? dateOnlyUtc(before) : today;
      const upperBound = beforeCandidate < today ? beforeCandidate : today;

      const rows = await prisma.day.findMany({
        where: { userId: user.id, date: { lt: upperBound } },
        orderBy: { date: 'desc' },
        take: limit + 1, // +1 sonduje istnienie kolejnej strony
        include: { goals: { orderBy: { position: 'asc' } } },
      });

      const hasMore = rows.length > limit;
      const items = (hasMore ? rows.slice(0, limit) : rows).map(toDaySummary);
      const last = items.at(-1);
      const nextCursor = hasMore && last ? last.date : null;
      return { items, nextCursor };
    },
  );

  // BE-17 — pobranie dnia po dacie (szczegóły historyczne dla FE-10 „klik w dzień z historii").
  // Read-only, pełny dzień (z notatkami, w przeciwieństwie do okrojonej historii). `date ≤ dziś`.
  // Walidacja kalendarzowa daty lokalnie (patrz dług techniczny: docelowo wspólny isoDateString).
  app.get(
    '/days/:date',
    {
      preHandler: requireAuth,
      schema: {
        params: z.object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .refine((s) => {
              const d = dateOnlyUtc(s);
              return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
            }, 'Niepoprawna data kalendarzowa'),
        }),
        response: { 200: dayResponseSchema, 400: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { user } = getAuthSession(request);
      const { date } = request.params;
      const today = localDateInTimeZone(new Date(), user.timezone);
      if (date > today) {
        // porównanie leksykograficzne YYYY-MM-DD == kalendarzowe
        const err: ApiError = {
          error: { message: 'Nie można pobrać dnia z przyszłości', code: 'FUTURE_DATE' },
        };
        return reply.status(400).send(err);
      }
      const day = await prisma.day.findUnique({
        where: { userId_date: { userId: user.id, date: dateOnlyUtc(date) } },
        include: { goals: { orderBy: { position: 'asc' } } },
      });
      return reply.status(200).send({ day: day ? toDayResponse(day) : null });
    },
  );

  // BE-12/BE-19 — wieczorne odznaczenie: oznacza każdy z 3 celów (dowieziony/nie + opcjonalna notatka),
  // zapisuje notatkę wieczorną i ustawia dzień na `closed`. Reguły (istnienie dnia „dziś" / spójność
  // celów) w checkCanCloseDay. BE-19: dzień „dziś" można re-submitować także po zamknięciu (mutowalność
  // po dacie, nie po statusie); dni przeszłe nieosiągalne (endpoint ładuje tylko userToday). Zapis atomowy.
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

      // guard.ok: dzień istnieje (dziś), a body.goals to dokładnie cele tego dnia.
      // BE-19: dzień „dziś" jest mutowalny także gdy `closed` (re-submit wieczoru), więc bramka
      // gate'uje po `userId, date` (= dziś — endpoint ładuje wyłącznie userToday), NIE po statusie.
      // Chroni to nadal atomowo przed równoległym double-submit (warunkowy updateMany po kluczu dnia)
      // oraz — strukturalnie — przed mutacją dni przeszłych (nieosiągalne tą trasą). `count===0` to
      // teraz przypadek obronny (dzień zniknął) → rollback → 409.
      try {
        const updated = await prisma.$transaction(async (tx) => {
          const gate = await tx.day.updateMany({
            where: { userId: user.id, date },
            data: { eveningNote: body.eveningNote ?? null, status: 'closed' },
          });
          if (gate.count === 0) throw new DayAlreadyClosedError();
          for (const mark of body.goals) {
            await tx.goal.update({
              where: { id: mark.id },
              data: { completed: mark.completed, completedNote: mark.completedNote ?? null },
            });
          }
          const full = await tx.day.findUnique({
            where: { userId_date: { userId: user.id, date } },
            include: { goals: { orderBy: { position: 'asc' } } },
          });
          if (!full) throw new Error('Dzień zniknął w trakcie zamykania'); // nieosiągalne
          return full;
        });
        return await reply.status(200).send(toDayResponse(updated));
      } catch (err) {
        if (err instanceof DayAlreadyClosedError) {
          const conflict: ApiError = {
            error: { message: 'Dzień jest już zamknięty', code: 'DAY_ALREADY_CLOSED' },
          };
          return await reply.status(409).send(conflict);
        }
        throw err;
      }
    },
  );

  // BE-11/BE-19 — edycja porannego wpisu. Zastępuje treść poranną (1 główny + 2 poboczne + notatka)
  // dla dnia „dziś", NIEZALEŻNIE od statusu (BE-19: dziś closed też edytowalny — mutowalność po dacie).
  // Dni przeszłe zamrożone strukturalnie (endpoint ładuje tylko userToday). Atomowa bramka po kluczu dnia.
  app.patch(
    '/days/today',
    {
      preHandler: requireAuth,
      schema: {
        body: morningEntrySchema,
        response: { 200: daySchema, 404: apiErrorSchema, 409: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { user } = getAuthSession(request);
      const body = request.body;
      const date = userToday(user.timezone);

      const day = await prisma.day.findUnique({
        where: { userId_date: { userId: user.id, date } },
        include: { goals: { orderBy: { position: 'asc' } } },
      });

      const guard = checkDayMutable(day);
      if (!guard.ok) {
        const err: ApiError = { error: { message: guard.message, code: guard.code } };
        return reply.status(guard.status).send(err);
      }
      if (!day) throw new Error('Dzień zniknął po walidacji'); // nieosiągalne — zawężenie typu

      const mainGoal = day.goals.find((g) => g.kind === 'main');
      const secGoals = day.goals.filter((g) => g.kind === 'secondary');
      if (!mainGoal || secGoals.length !== 2) {
        throw new Error('Niespójny stan celów dnia'); // inwariant wpisu porannego (1 główny + 2 poboczne)
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          // BE-19: gate po `userId, date` (= dziś), NIE po statusie — dziś closed też edytowalny.
          const gate = await tx.day.updateMany({
            where: { userId: user.id, date },
            data: { morningNote: body.morningNote ?? null },
          });
          if (gate.count === 0) throw new DayAlreadyClosedError();

          await tx.goal.update({
            where: { id: mainGoal.id },
            data: { title: body.main.title, note: body.main.note ?? null },
          });
          for (let i = 0; i < secGoals.length; i++) {
            const goal = secGoals[i];
            const input = body.secondary[i];
            if (!goal || !input) throw new Error('Niespójny stan celów pobocznych');
            await tx.goal.update({
              where: { id: goal.id },
              data: { title: input.title, note: input.note ?? null },
            });
          }

          const full = await tx.day.findUnique({
            where: { userId_date: { userId: user.id, date } },
            include: { goals: { orderBy: { position: 'asc' } } },
          });
          if (!full) throw new Error('Dzień zniknął w trakcie edycji'); // nieosiągalne
          return full;
        });
        return await reply.status(200).send(toDayResponse(updated));
      } catch (err) {
        if (err instanceof DayAlreadyClosedError) {
          const conflict: ApiError = {
            error: { message: 'Dzień jest już zamknięty', code: 'DAY_ALREADY_CLOSED' },
          };
          return await reply.status(409).send(conflict);
        }
        throw err;
      }
    },
  );
};
