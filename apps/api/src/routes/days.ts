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
  goalMarkPatchSchema,
  morningEntrySchema,
} from '@trzy-cele/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { dateOnlyUtc, localDateInTimeZone, userToday } from '../lib/day-boundary';
import { checkCanCloseDay, resolveEditableDate } from '../lib/day-service';
import { prisma } from '../lib/prisma';
import { getAuthSession, requireAuth } from '../lib/require-auth';

type DayWithGoals = Prisma.DayGetPayload<{ include: { goals: true } }>;

/** Walidacja param `:date` — `YYYY-MM-DD` + poprawność kalendarzowa (spójna z GET /days/:date). */
const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = dateOnlyUtc(s);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Niepoprawna data kalendarzowa');

/** Sygnał wewnętrzny: dzień „dziś" zamknięto równolegle (wyścig) → rollback transakcji, mapowany na 409. */
class DayAlreadyClosedError extends Error {}

/** Sygnał wewnętrzny: dzień „wczoraj" zamrożono między checkiem a zapisem → rollback, mapowany na 403. */
class DayFrozenError extends Error {}

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
        params: z.object({ date: dateParam }),
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

  // Oznaczanie celu per-cel (odpięte od zamykania dnia): natychmiastowy zapis `completed`
  // + `completedNote` pojedynczego celu. NIE zmienia `status` dnia. Okno łaski (dziś lub
  // wczoraj-jeśli-`evening_pending`) rozstrzyga `resolveEditableDate`; cel spoza dnia → 400.
  app.patch(
    '/days/:date/goals/:goalId',
    {
      preHandler: requireAuth,
      schema: {
        params: z.object({ date: dateParam, goalId: z.string() }),
        body: goalMarkPatchSchema,
        response: { 200: daySchema, 400: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { user } = getAuthSession(request);
      const { date, goalId } = request.params;
      const body = request.body;
      const today = localDateInTimeZone(new Date(), user.timezone);

      const day = await prisma.day.findUnique({
        where: { userId_date: { userId: user.id, date: dateOnlyUtc(date) } },
        include: { goals: { orderBy: { position: 'asc' } } },
      });

      const editable = resolveEditableDate({ date, today, day });
      if (!editable.ok) {
        const err: ApiError = { error: { message: editable.message, code: editable.code } };
        return reply.status(editable.status).send(err);
      }
      if (!day) {
        const err: ApiError = { error: { message: 'Brak wpisu na ten dzień', code: 'NO_DAY_TODAY' } };
        return reply.status(404).send(err);
      }
      if (!day.goals.some((g) => g.id === goalId)) {
        const err: ApiError = {
          error: { message: 'Cel nie należy do tego dnia', code: 'GOAL_NOT_IN_DAY' },
        };
        return reply.status(400).send(err);
      }

      const gate = await prisma.goal.updateMany({
        where: {
          id: goalId,
          day: {
            userId: user.id,
            date: dateOnlyUtc(date),
            ...(date === today ? {} : { status: 'evening_pending' }),
          },
        },
        data: { completed: body.completed, completedNote: body.completedNote ?? null },
      });
      if (gate.count === 0) {
        const frozen: ApiError = {
          error: { message: 'Ten dzień zamknięto w międzyczasie', code: 'DAY_FROZEN' },
        };
        return reply.status(403).send(frozen);
      }
      const full = await prisma.day.findUnique({
        where: { userId_date: { userId: user.id, date: dateOnlyUtc(date) } },
        include: { goals: { orderBy: { position: 'asc' } } },
      });
      if (!full) throw new Error('Dzień zniknął w trakcie oznaczania'); // nieosiągalne
      return reply.status(200).send(toDayResponse(full));
    },
  );

  // Domknięcie wieczoru: zapisuje notatkę wieczorną, ustawia `status='closed'` i stosuje PODZBIÓR
  // (0..3) przesłanych oznaczeń (te id muszą należeć do dnia). All-or-nothing zniesione — cele
  // nieoznaczone pozostają jak są. Okno łaski (dziś / wczoraj-pending) przez resolveEditableDate.
  // Atomowa bramka wyścigu (`updateMany` po kluczu dnia) chroni przed równoległym double-submit.
  const handleEvening = async (request: FastifyRequest, reply: FastifyReply, date: string) => {
    const { user } = getAuthSession(request);
    const body = eveningEntrySchema.parse(request.body);
    const today = localDateInTimeZone(new Date(), user.timezone);
    const dateUtc = dateOnlyUtc(date);

    const day = await prisma.day.findUnique({
      where: { userId_date: { userId: user.id, date: dateUtc } },
      include: { goals: true },
    });

    const editable = resolveEditableDate({ date, today, day });
    if (!editable.ok) {
      const err: ApiError = { error: { message: editable.message, code: editable.code } };
      return reply.status(editable.status).send(err);
    }

    const guard = checkCanCloseDay(day, body.goals.map((g) => g.id));
    if (!guard.ok) {
      const err: ApiError = { error: { message: guard.message, code: guard.code } };
      return reply.status(guard.status).send(err);
    }

    const isToday = date === today;
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const gate = await tx.day.updateMany({
          where: {
            userId: user.id,
            date: dateUtc,
            ...(isToday ? {} : { status: 'evening_pending' }),
          },
          data: { eveningNote: body.eveningNote ?? null, status: 'closed' },
        });
        if (gate.count === 0) throw isToday ? new DayAlreadyClosedError() : new DayFrozenError();
        for (const mark of body.goals) {
          await tx.goal.update({
            where: { id: mark.id },
            data: { completed: mark.completed, completedNote: mark.completedNote ?? null },
          });
        }
        const full = await tx.day.findUnique({
          where: { userId_date: { userId: user.id, date: dateUtc } },
          include: { goals: { orderBy: { position: 'asc' } } },
        });
        if (!full) throw new Error('Dzień zniknął w trakcie zamykania'); // nieosiągalne
        return full;
      });
      return await reply.status(200).send(toDayResponse(updated));
    } catch (err) {
      if (err instanceof DayFrozenError) {
        const frozen: ApiError = {
          error: { message: 'Ten dzień zamknięto w międzyczasie', code: 'DAY_FROZEN' },
        };
        return await reply.status(403).send(frozen);
      }
      if (err instanceof DayAlreadyClosedError) {
        const conflict: ApiError = {
          error: { message: 'Dzień jest już zamknięty', code: 'DAY_ALREADY_CLOSED' },
        };
        return await reply.status(409).send(conflict);
      }
      throw err;
    }
  };

  const eveningSchema = {
    body: eveningEntrySchema,
    response: { 200: daySchema, 400: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema, 409: apiErrorSchema },
  };

  app.post(
    '/days/today/evening',
    { preHandler: requireAuth, schema: eveningSchema },
    async (request, reply) =>
      handleEvening(request, reply, localDateInTimeZone(new Date(), getAuthSession(request).user.timezone)),
  );

  app.post(
    '/days/:date/evening',
    { preHandler: requireAuth, schema: { ...eveningSchema, params: z.object({ date: dateParam }) } },
    async (request, reply) => handleEvening(request, reply, request.params.date),
  );

  // Edycja porannego wpisu (1 główny + 2 poboczne + notatka) — pełne zastąpienie treści.
  // NIE zmienia `status`. Okno łaski (dziś / wczoraj-pending) przez resolveEditableDate.
  const handleMorningEdit = async (request: FastifyRequest, reply: FastifyReply, date: string) => {
    const { user } = getAuthSession(request);
    const body = morningEntrySchema.parse(request.body);
    const today = localDateInTimeZone(new Date(), user.timezone);
    const dateUtc = dateOnlyUtc(date);

    const day = await prisma.day.findUnique({
      where: { userId_date: { userId: user.id, date: dateUtc } },
      include: { goals: { orderBy: { position: 'asc' } } },
    });

    const editable = resolveEditableDate({ date, today, day });
    if (!editable.ok) {
      const err: ApiError = { error: { message: editable.message, code: editable.code } };
      return reply.status(editable.status).send(err);
    }
    if (!day) {
      const err: ApiError = { error: { message: 'Brak wpisu na ten dzień', code: 'NO_DAY_TODAY' } };
      return reply.status(404).send(err);
    }

    const mainGoal = day.goals.find((g) => g.kind === 'main');
    const secGoals = day.goals.filter((g) => g.kind === 'secondary');
    if (!mainGoal || secGoals.length !== 2) {
      throw new Error('Niespójny stan celów dnia'); // inwariant wpisu porannego (1 główny + 2 poboczne)
    }

    const isToday = date === today;
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const gate = await tx.day.updateMany({
          where: {
            userId: user.id,
            date: dateUtc,
            ...(isToday ? {} : { status: 'evening_pending' }),
          },
          data: { morningNote: body.morningNote ?? null },
        });
        if (gate.count === 0) throw isToday ? new DayAlreadyClosedError() : new DayFrozenError();

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
          where: { userId_date: { userId: user.id, date: dateUtc } },
          include: { goals: { orderBy: { position: 'asc' } } },
        });
        if (!full) throw new Error('Dzień zniknął w trakcie edycji'); // nieosiągalne
        return full;
      });
      return await reply.status(200).send(toDayResponse(updated));
    } catch (err) {
      if (err instanceof DayFrozenError) {
        const frozen: ApiError = {
          error: { message: 'Ten dzień zamknięto w międzyczasie', code: 'DAY_FROZEN' },
        };
        return await reply.status(403).send(frozen);
      }
      if (err instanceof DayAlreadyClosedError) {
        const conflict: ApiError = {
          error: { message: 'Dzień jest już zamknięty', code: 'DAY_ALREADY_CLOSED' },
        };
        return await reply.status(409).send(conflict);
      }
      throw err;
    }
  };

  const morningEditSchema = {
    body: morningEntrySchema,
    response: { 200: daySchema, 400: apiErrorSchema, 403: apiErrorSchema, 404: apiErrorSchema, 409: apiErrorSchema },
  };

  app.patch(
    '/days/today',
    { preHandler: requireAuth, schema: morningEditSchema },
    async (request, reply) =>
      handleMorningEdit(request, reply, localDateInTimeZone(new Date(), getAuthSession(request).user.timezone)),
  );

  app.patch(
    '/days/:date',
    { preHandler: requireAuth, schema: { ...morningEditSchema, params: z.object({ date: dateParam }) } },
    async (request, reply) => handleMorningEdit(request, reply, request.params.date),
  );
};
