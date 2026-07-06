import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Testy FE: jsdom, bo klient Better Auth (react) sięga po `window` już przy imporcie modułu —
// smoke test importu authClient wymaga środowiska przeglądarkowego.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
