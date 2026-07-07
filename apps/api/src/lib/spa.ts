import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { ApiError } from '@trzy-cele/shared';
import type { FastifyInstance } from 'fastify';
import { getEnv } from '../config/env';

/**
 * Serwowanie SPA + jednolity notFoundHandler (BE-8).
 *
 * Prod: jeden kontener serwuje statyk zbudowanej SPA (`/` i assety) obok API (`/api/*`),
 * z fallbackiem na index.html dla routingu klienckiego. Dev: SPA serwuje Vite (nie tu),
 * więc każda nietrafiona trasa → 404 ApiError.
 */
export function registerSpa(app: FastifyInstance): void {
  const isProd = getEnv().NODE_ENV === 'production';

  if (isProd) {
    // W obrazie bundle leży w /app/apps/api/dist → statyk SPA w /app/apps/web/dist.
    const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
    app.register(fastifyStatic, { root: webDist, wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    const url = request.raw.url ?? '';
    const isApi = url === '/api' || url.startsWith('/api/');
    // Prod: trasy nie-API to routing kliencki SPA → oddaj index.html.
    if (isProd && !isApi) {
      return reply.sendFile('index.html');
    }
    const body: ApiError = { error: { message: 'Not Found', code: 'NOT_FOUND' } };
    return reply.status(404).send(body);
  });
}
