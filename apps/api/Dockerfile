# Obraz produkcyjny (BE-8): JEDEN kontener serwujący API (/api/*) + statyk SPA (/).
# Kontekst budowania = root monorepo (docker build -f apps/api/Dockerfile .).
FROM node:22-slim

# openssl — wymagany przez silnik zapytań Prisma na obrazach slim (debian).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# Najpierw manifesty (lepszy cache warstwy zależności).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# postinstall (prisma generate) potrzebuje schematu — dlatego prisma/ kopiujemy powyżej.
RUN pnpm install --frozen-lockfile

# Reszta źródeł + build (typecheck + tsup API + vite web).
COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 3000
# Nie root w runtime (hardening); pliki są world-readable, app nie pisze do FS.
USER node
# Migracje na prod: `prisma migrate deploy` uruchamiane przy wdrożeniu (FND-6), nie tutaj.
CMD ["node", "apps/api/dist/index.js"]
