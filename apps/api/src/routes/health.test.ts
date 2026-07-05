import { describe, expect, it } from 'vitest';
import { buildServer } from '../server';

describe('GET /api/health', () => {
  it('zwraca 200 i { status: "ok" }', async () => {
    const app = buildServer({ logger: false });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });
});
