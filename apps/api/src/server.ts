import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { authRoutes } from './routes/auth';
import { healthRoutes } from './routes/health';

/**
 * Buduje instancję Fastify: podpina provider zod (walidacja wejścia i serializacja
 * wyjścia z kontraktów `@trzy-cele/shared`) i rejestruje trasy pod prefiksem /api.
 *
 * Wydzielone od startu nasłuchu (index.ts), by dało się testować przez `inject`
 * bez otwierania portu.
 */
export function buildServer({ logger = true }: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(authRoutes, { prefix: '/api' });
  app.register(healthRoutes, { prefix: '/api' });

  return app;
}
