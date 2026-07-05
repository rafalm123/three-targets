import { loadEnv } from './config/env';
import { buildServer } from './server';

// Fail-fast: waliduje konfigurację zanim cokolwiek wystartuje.
const env = loadEnv();

const app = buildServer();

// host 0.0.0.0 — wymagane w kontenerze (Render/Docker), nie tylko localhost.
app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
