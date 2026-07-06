import { loadEnv } from './config/env';

// Waliduje env i ładuje .env do process.env ZANIM zaimportują się moduły z niego korzystające
// (Better Auth / Prisma w auth.ts). Dlatego serwer importujemy dynamicznie — dopiero po loadEnv.
const env = loadEnv();

const { buildServer } = await import('./server');
const app = buildServer();

// host 0.0.0.0 — wymagane w kontenerze (Render/Docker), nie tylko localhost.
app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
