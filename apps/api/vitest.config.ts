import { defineConfig } from 'vitest/config';

// Testy nie mają .env — dostarczamy minimalny, poprawny zestaw zmiennych, żeby moduły
// (auth.ts przez getEnv()) mogły się zbudować bez realnego środowiska ani bazy.
export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      BETTER_AUTH_SECRET: 'test-secret-0123456789abcdef',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
  },
});
