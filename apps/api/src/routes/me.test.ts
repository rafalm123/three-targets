import { describe, expect, it } from 'vitest';
import { buildServer } from '../server';

// Kluczowa asercja DoD BE-5: trasa chroniona odrzuca gościa. Ścieżka gościa nie dotyka bazy.
describe('GET /api/me (ochrona tras)', () => {
  it('gość bez sesji → 401', async () => {
    const app = buildServer({ logger: false });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ error: 'Unauthorized' });
    } finally {
      await app.close();
    }
  });
});
