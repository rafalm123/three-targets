import { defineConfig } from 'vitest/config';

// Testy integracyjne (`*.itest.ts`) uderzają w REALNY Postgres: lokalnie przez apps/api/.env
// (docker-compose/Colima), w CI przez service container (env joba). Świadomie NIE nadpisujemy
// DATABASE_URL/DIRECT_URL — mają pochodzić z .env (dev) lub env CI. Ustawiamy tylko NODE_ENV=test
// (trustedOrigins localhost:5173 + brak Secure → sign-up przez inject działa).
export default defineConfig({
  test: {
    include: ['src/**/*.itest.ts'],
    env: { NODE_ENV: 'test' },
    fileParallelism: false, // współdzielona baza — bez równoległych zapisów między plikami
  },
});
