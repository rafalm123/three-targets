import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../server';
import { registerErrorHandling } from './errors';

describe('obsługa błędów (BE-7)', () => {
  it('nieznana trasa → 404 w formacie ApiError', async () => {
    const app = buildServer({ logger: false });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/nie-ma-takiej' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: { message: 'Not Found', code: 'NOT_FOUND' } });
    } finally {
      await app.close();
    }
  });

  it('5xx nie wycieka szczegółów błędu ani stack trace do klienta', async () => {
    const app = Fastify({ logger: false });
    registerErrorHandling(app);
    app.get('/boom', async () => {
      throw new Error('sekret-wewnetrzny');
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/boom' });
      expect(res.statusCode).toBe(500);
      expect(res.body).not.toContain('sekret-wewnetrzny');
      expect(res.body.toLowerCase()).not.toContain('stack');
      expect(res.json()).toMatchObject({
        error: { message: 'Internal Server Error', code: 'INTERNAL' },
      });
    } finally {
      await app.close();
    }
  });
});
