import { describe, expect, it } from 'vitest';
import { buildServer } from '../server';

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
});
