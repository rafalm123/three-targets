import { defineConfig } from 'tsup';

// Bundluje API do jednego pliku pod obraz produkcyjny (BE-8). @trzy-cele/shared (surowy TS)
// jest WBUNDLOWANY (noExternal); zależności npm (fastify, better-auth, @prisma/client, zod…)
// zostają external — są w node_modules obrazu.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  noExternal: ['@trzy-cele/shared'],
});
