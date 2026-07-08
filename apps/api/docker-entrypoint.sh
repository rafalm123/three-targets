#!/bin/sh
# Entrypoint produkcyjny (FND-6). Migracje na starcie kontenera (decyzja @sa), potem serwer.
# `exec` zastępuje powłokę procesem node → SIGTERM z Rendera trafia w Fastify (czyste zamknięcie).
set -e

cd /app/apps/api

# prisma migrate deploy jest idempotentne: stosuje tylko brakujące migracje, przy komplecie = no-op.
# Używa directUrl (DIRECT_URL) — połączenie bezpośrednie, nie pooler Neona.
# Binarka wprost (NIE `pnpm exec`): USER node nie ma cache corepacka roota, więc `pnpm` dociągałby
# się z rejestru npm przy każdym cold starcie — wywalamy sieć i corepack ze ścieżki bootu.
node_modules/.bin/prisma migrate deploy

exec node dist/index.js
