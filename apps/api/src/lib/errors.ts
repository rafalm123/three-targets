import type { ApiError } from '@trzy-cele/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/**
 * Spójna obsługa błędów (BE-7): jednolity format `ApiError`, logowanie, brak wycieku
 * stack trace do klienta. Rejestrowane w buildServer.
 */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Błąd walidacji wejścia (zod na granicy) → 400.
    if (hasZodFastifySchemaValidationErrors(error)) {
      request.log.warn({ err: error }, 'walidacja żądania nie powiodła się');
      const body: ApiError = {
        error: { message: 'Błąd walidacji żądania', code: 'VALIDATION_ERROR' },
      };
      return reply.status(400).send(body);
    }

    const status = error.statusCode ?? 500;

    // 5xx / nieoczekiwane → pełny błąd tylko do logu; klientowi bezpieczny komunikat.
    if (status >= 500) {
      request.log.error({ err: error }, 'błąd serwera');
      const body: ApiError = { error: { message: 'Internal Server Error', code: 'INTERNAL' } };
      return reply.status(500).send(body);
    }

    // 4xx świadomie rzucone → komunikat jest bezpieczny do pokazania.
    request.log.warn({ err: error }, 'błąd klienta');
    const body: ApiError = { error: { message: error.message, code: error.code } };
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiError = { error: { message: 'Not Found', code: 'NOT_FOUND' } };
    return reply.status(404).send(body);
  });
}
