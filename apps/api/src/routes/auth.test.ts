import { describe, expect, it } from 'vitest';
import { buildServer } from '../server';

// Chroni najkruchszy fragment BE-4: catch-all → auth.handler → forwarding odpowiedzi.
// /api/auth/ok to health Better Auth — nie wymaga bazy.
describe('catch-all /api/auth/*', () => {
  it('przekazuje żądanie do Better Auth (GET /api/auth/ok → 200)', async () => {
    const app = buildServer({ logger: false });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/auth/ok' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true });
    } finally {
      await app.close();
    }
  });
});
