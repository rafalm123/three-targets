# Trzy Cele

Prywatna aplikacja-dziennik: rano 1 cel główny + 2 poboczne + notatki, wieczorem odznaczasz
co dowiozłeś, plus historia i licznik dni.

Dokumentacja techniczna: [`CLAUDE.md`](./CLAUDE.md) · backlog: [`docs/backlog_mvp.md`](./docs/backlog_mvp.md).

## Stack

Monorepo `pnpm` (TypeScript wszędzie): backend **Fastify + zod**, frontend **React + Vite**,
wspólne kontrakty w `packages/shared`, **Prisma** + **PostgreSQL**, **Better Auth**. W produkcji
jeden kontener serwuje API (`/api/*`) i statyczną SPA (`/`).

```
apps/api      backend (Fastify) + Prisma + Better Auth
apps/web      frontend (React + Vite, SPA)
packages/shared  współdzielone kontrakty API (zod + typy)
```

## Wymagania

- **Node 22+** (LTS) i **pnpm** (przez `corepack enable`)
- **Runtime kontenerów zgodny z OCI** dla lokalnego Postgresu — na macOS rekomendowana **Colima**:
  ```bash
  brew install colima docker
  colima start          # po każdym restarcie Maca
  ```

## Uruchomienie (development)

```bash
pnpm install                     # zależności (raz)
docker compose up -d db          # lokalny Postgres na :5432
cp apps/api/.env.example apps/api/.env   # uzupełnić DATABASE_URL, sekrety
pnpm dev                         # API (:3000) + frontend (:5173) razem
```

Otwórz `http://localhost:5173` — Vite proxuje `/api/*` na backend (symuluje docelowe
same-origin). Zatrzymanie: `Ctrl+C`; baza: `docker compose down`.

### Baza: lokalna vs chmura

- **Lokalnie (offline, testy):** Postgres z `docker-compose` — `DATABASE_URL` wskazuje na
  `postgresql://trzycele:trzycele@localhost:5432/trzycele`.
- **Chmura (staging/prod):** Neon — `DATABASE_URL` z panelu Neon (sekret, nie w repo).

## Jakość

```bash
pnpm typecheck   # kontrola typów
pnpm lint        # ESLint
pnpm test        # testy jednostkowe
pnpm build       # build produkcyjny
```

„Done" = testy i lint przechodzą.
