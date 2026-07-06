import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyPluginAsync } from 'fastify';
import { auth } from '../lib/auth';

/**
 * Catch-all dla Better Auth. Rejestrowany pod prefiksem /api → obsługuje /api/auth/*
 * (sign-up, sign-in, sign-out, get-session…). Konwertuje żądanie Fastify na Fetch Request,
 * przepuszcza przez `auth.handler` i przekazuje odpowiedź z powrotem.
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  app.route({
    method: ['GET', 'POST'],
    url: '/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const req = new Request(url.toString(), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body ? await response.text() : null);
    },
  });
};
