import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { auth } from './auth';

// Sesja zwracana przez Better Auth (bez null).
type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: AuthSession;
  }
}

/**
 * preHandler chroniący trasy: gość (brak ważnej sesji) → 401. Przy sukcesie dokłada
 * `request.authSession` dla handlera. Reużywalny dla wszystkich chronionych tras (dni/cele, Faza 1).
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) {
    await reply.status(401).send({ error: 'Unauthorized' });
    return;
  }
  request.authSession = session;
}

/**
 * Zwraca sesję ustawioną przez `requireAuth`. Rzuca głośno, jeśli trasa nie ma tego
 * preHandlera — zamiast po cichu zwracać `undefined` (chroni przed zapomnianym guardem).
 */
export function getAuthSession(request: FastifyRequest): AuthSession {
  if (!request.authSession) {
    throw new Error('getAuthSession() wywołane bez preHandlera requireAuth');
  }
  return request.authSession;
}
