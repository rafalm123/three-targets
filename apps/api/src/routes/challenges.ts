import {
  type ApiError,
  apiErrorSchema,
  challengeCreateSchema,
  challengeListSchema,
  challengeResponseSchema,
  challengeUpdateSchema,
  challengeWithPointsSchema,
} from '@trzy-cele/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ActiveChallengeExistsError,
  ChallengeNotEditableError,
  createChallenge,
  getActiveChallenge,
  getChallengeById,
  listChallenges,
  updateChallenge,
} from '../lib/challenge-service';
import { getAuthSession, requireAuth } from '../lib/require-auth';

/**
 * BE-P3 — „Lista celów" = 30-dniowe wyzwanie punktowe. Warstwa tras (cienka); logika w
 * lib/challenge-service.ts (+ lib/points-service.ts czysta). Wszystkie trasy `requireAuth`.
 *
 * POST   /api/challenges         → 201 ChallengeWithPoints; 409 gdy istnieje AKTYWNA lista.
 * GET    /api/challenges/active  → { challenge: ChallengeWithPoints | null }.
 * GET    /api/challenges         → { items: ChallengeSummary[] } (historia: zakończone, od najnowszych).
 * GET    /api/challenges/:id     → { challenge: ChallengeWithPoints | null } (tylko własne).
 * PATCH  /api/challenges/:id     → 200 ChallengeWithPoints (edycja tylko AKTYWNEJ własnej listy; 404 inaczej).
 */
export const challengeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/challenges',
    {
      preHandler: requireAuth,
      schema: {
        body: challengeCreateSchema,
        response: { 201: challengeWithPointsSchema, 409: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { user } = getAuthSession(request);
      try {
        const challenge = await createChallenge(user.id, user.timezone, request.body);
        return await reply.status(201).send(challenge);
      } catch (err) {
        if (err instanceof ActiveChallengeExistsError) {
          const conflict: ApiError = {
            error: { message: err.message, code: 'ACTIVE_CHALLENGE_EXISTS' },
          };
          return await reply.status(409).send(conflict);
        }
        throw err;
      }
    },
  );

  app.get(
    '/challenges/active',
    {
      preHandler: requireAuth,
      schema: { response: { 200: challengeResponseSchema } },
    },
    async (request) => {
      const { user } = getAuthSession(request);
      const challenge = await getActiveChallenge(user.id, user.timezone);
      return { challenge };
    },
  );

  app.get(
    '/challenges',
    {
      preHandler: requireAuth,
      schema: { response: { 200: challengeListSchema } },
    },
    async (request) => {
      const { user } = getAuthSession(request);
      const items = await listChallenges(user.id, user.timezone);
      return { items };
    },
  );

  app.get(
    '/challenges/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: z.object({ id: z.string().min(1) }),
        response: { 200: challengeResponseSchema },
      },
    },
    async (request) => {
      const { user } = getAuthSession(request);
      const challenge = await getChallengeById(user.id, user.timezone, request.params.id);
      return { challenge };
    },
  );

  app.patch(
    '/challenges/:id',
    {
      preHandler: requireAuth,
      schema: {
        params: z.object({ id: z.string().min(1) }),
        body: challengeUpdateSchema,
        response: { 200: challengeWithPointsSchema, 404: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const { user } = getAuthSession(request);
      try {
        const challenge = await updateChallenge(
          user.id,
          user.timezone,
          request.params.id,
          request.body,
        );
        return await reply.status(200).send(challenge);
      } catch (err) {
        if (err instanceof ChallengeNotEditableError) {
          const notFound: ApiError = {
            error: { message: err.message, code: 'CHALLENGE_NOT_EDITABLE' },
          };
          return await reply.status(404).send(notFound);
        }
        throw err;
      }
    },
  );
};
