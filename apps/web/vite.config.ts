import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev: proxy /api → backend (same-origin w prod, więc w dev symulujemy to proxy).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
