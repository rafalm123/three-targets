# Trzy Cele — Podsumowanie Fazy 1 (MVP)

> Stan na **2026-07-09**: Faza 1 **domknięta i wdrożona na produkcji** → **https://trzy-cele.onrender.com**
> Ten dokument = pełny rejestr tego, co zbudowaliśmy w Fazie 1. Bieżący handoff/„jak kontynuować": `PROGRESS.md`.

## 1. Co powstało — w jednym zdaniu

Prywatny dziennik „trzy dzienne cele" (1 główny + 2 poboczne, odznaczane wieczorem) — od zera do wdrożonego MVP:
monorepo TS, logowanie, pełny rytuał dnia (rano → edycja → wieczór → historia → licznik serii), CI, backup bazy
i deploy jednego kontenera na Render + Neon. 27 PR-ów, każdy przez review, 127 testów, na produkcji.

## 2. Stack

| Warstwa | Technologia |
|---|---|
| Monorepo | `pnpm` workspaces: `apps/api`, `apps/web`, `packages/shared` |
| Backend | Node 22 + TypeScript (strict) + **Fastify 5** + **zod** (`fastify-type-provider-zod` v7) |
| Auth | **Better Auth 1.6.23** (pin) — własna baza, ciasteczka sesji HttpOnly |
| ORM / DB | **Prisma 6.19.3** (pin) + **PostgreSQL** (prod: Neon PG18; dev: docker-compose PG17) |
| Frontend | **React 19** + **Vite 6** (SPA) + **react-router-dom 7** + Better Auth React client |
| Kontrakty | `packages/shared` — schematy **zod** + wyinferowane typy (jedno źródło prawdy FE↔BE) |
| Hosting | **Render** (free), **jeden kontener** Docker (API `/api/*` + statyk SPA `/`, same-origin) |
| CI/CD | GitHub Actions (quality + integracja na Postgresie), auto-deploy z `main` |
| Backup | GitHub Actions cron `pg_dump` (postgres:18) → artifact |

## 3. Backend (`apps/api`)

### Endpointy (prefiks `/api`)
| Metoda + ścieżka | Zadanie | Task |
|---|---|---|
| `POST /auth/*` | Better Auth: rejestracja / login / logout / sesja | BE-4 |
| `GET /me` | dane zalogowanego + ochrona tras (401) | BE-5 |
| `GET /health` | health check (dla Rendera) | walking skeleton |
| `POST /days` | wpis poranny (1 główny + 2 poboczne + notatka) → dzień `evening_pending` | BE-10 |
| `GET /days/today` | dzień „dzisiaj" albo `{day:null}` (brak wpisu) | BE-13 |
| `GET /days/:date` | pełny dzień po dacie (szczegół historii), `date ≤ dziś` | BE-17 |
| `PATCH /days/today` | edycja porannego wpisu (pełne zastąpienie), tylko `evening_pending` | BE-11 |
| `POST /days/today/evening` | wieczorne odznaczenie 3 celów → dzień `closed` | BE-12 |
| `GET /days/history` | historia (podsumowania), paginacja keyset `?before=&limit=` | BE-14 |
| `GET /stats/streak` | `{current, longest, totalDays, asOfDate}` | BE-15 |

### Logika domenowa (czysta, testowana bez DB)
- **`lib/day-boundary.ts`** — granica doby: „dziś" liczone serwerowo z `users.timezone` (IANA); `userToday`, `addDaysIso` (arytmetyka na północy UTC, DST-safe). (BE-16)
- **`lib/day-service.ts`** — reguły mutacji dnia w jednym miejscu: `checkDayMutable` (istnienie + niemutowalność `closed`) i `checkCanCloseDay` (spójność 3 celów).
- **`lib/streak.ts`** — `computeStreak`: seria kolejnych dni `closed` wstecz od „dziś", grace dla „dziś" (dzień w toku nie zrywa serii).

### Model danych
- **Better Auth** generuje `user`/`session`/`account`/`verification`; pola domenowe jako `additionalFields`: `role` (`user`|`admin`), `timezone` (IANA, wymagane). `displayName` = pole `name`.
- **`Day`**: `userId, date (@db.Date), morningNote?, eveningNote?, status`. Unikat `(userId, date)`. Maszyna stanów **`evening_pending → closed`**; „przed wpisem" = brak rekordu.
- **`Goal`**: `dayId, kind (main|secondary), position, title, note?, completed (bool|null), completedNote?`.

### Warstwy i infrastruktura API
- Konwencja route → handler → serwis → Prisma; `server.ts` rejestruje trasy pod `/api`.
- `lib/require-auth.ts` (guard 401), `lib/errors.ts` (spójny `ApiError`, bez wycieku stacka), `lib/spa.ts` (w prod serwuje statyk SPA + SPA-fallback), `config/env.ts` (walidacja env zod na starcie), `index.ts` (graceful shutdown SIGTERM/SIGINT).

## 4. Frontend (`apps/web`)

### Auth (FE-1…5)
`routes/{login,register}-page.tsx`, `routes/guards.tsx` (`ProtectedRoute`/`PublicOnlyRoute`), `App.tsx` (routing),
`components/app-shell.tsx`, `components/states.tsx` (loading/empty/error), `lib/auth-client.ts` (`authClient`, `useSession`), `lib/auth-errors.ts`, `styles.css` (design tokens).

### Klient API dnia
`lib/api.ts` — `getToday` / `createDay` / `updateMorning` / `submitEvening` / `getHistory` / `getDayByDate` / `getStreak`;
walidacja odpowiedzi schematami z `@trzy-cele/shared`; `ApiRequestError` (kod/status) vs surowy rzut sieci.

### Widoki dziennika (FE-6…13)
| Plik | Widok |
|---|---|
| `routes/today-page.tsx` | **HUB „Dziś"** — routing pod-stanów (null → poranek / `evening_pending` → cele + akcje / `closed` → read-only); pod-tryby view/edit/evening |
| `routes/morning-form.tsx` | Poranek (1+2 cele + notatki) + tryb edycji (reuse) |
| `routes/evening-form.tsx` | Wieczór — **jawny wybór** dowieziony/nie dla 3 celów + licznik „oceń jeszcze N" |
| `routes/history-page.tsx` | Historia — lista + paginacja keyset („Pokaż starsze") |
| `routes/history-day-page.tsx` | Szczegół dnia na trasie **`/historia/:date`** (deep-link, back-button) |
| `components/streak-badge.tsx` + `streak-refresh.tsx` | Licznik serii 🔥, odświeżany po zamknięciu dnia |
| `components/day-readonly.tsx` | Podgląd dnia read-only (reuse HUB↔historia) |
| `components/logout-button.tsx` | Wylogowanie (wspólne w AppShell, na wszystkich trasach) |

- Dev: SPA woła API **same-origin** przez proxy Vite (`/api` → `:3000`). Prod: ten sam origin (jeden kontener).

## 5. Kontrakty współdzielone (`packages/shared`)
`auth.ts`, `day.ts` (`morningEntry`, `eveningEntry`, `day`, `dayResponse`, `daySummary`, `dayHistory`, `dayHistoryQuery`, `goal`, `goalMark`), `stats.ts` (`streak`), `error.ts`, `health.ts` — schematy zod + typy, importowane przez FE i BE.

## 6. Infrastruktura i wdrożenie

- **CI** (`.github/workflows/ci.yml`): job `quality` (lint/typecheck/test/build) + `integration` (Postgres 17 service container, `migrate deploy` + testy `*.itest.ts` na realnej bazie).
- **Deploy** (`render.yaml` + `apps/api/Dockerfile` + `apps/api/docker-entrypoint.sh`): Blueprint jednego kontenera (Docker, Frankfurt, free, auto-deploy z `main`, health `/api/health`). Migracje `prisma migrate deploy` **na starcie** kontenera (idempotentne, free-plan-safe), `exec node` (PID 1, czysty SIGTERM).
- **Backup** (`.github/workflows/backup.yml`): cron `pg_dump` (format custom, `postgres:18`) → artifact (retencja 30 dni) + ręczny trigger. Połączenie bezpośrednie (nie pooler).
- **Prod**: `https://trzy-cele.onrender.com` — Render free (cold start ~50 s po bezczynności), baza Neon PG18.
- **Instrukcje wdrożenia/backupu**: `docs/DEPLOY.md`.

## 7. Kluczowe decyzje architektoniczne (@sa)

1. **Jeden kontener (API + statyk SPA), same-origin** → brak CORS, ciasteczko first-party (działa w Safari).
2. **Maszyna stanów `evening_pending → closed`**; „przed wpisem" = brak rekordu (`day:null`), nie osobny status.
3. **`closed` niemutowalny**, egzekwowany **atomowo** (warunkowy `updateMany` w transakcji, nie tylko guard) — odporność na wyścig double-submit.
4. **Wieczór: jawny wybór `completed`** (nie domyślne `false`) — „niedowieziony" ≠ „jeszcze nieoceniony"; chroni dane pod przyszły system punktów (Faza 2).
5. **Historia = podsumowania** (bez pełnych notatek); szczegół dnia przez `GET /days/:date`. Szczegół jako **trasa** `/historia/:date` (back-button, refresh-safe).
6. **Paginacja keyset** po dacie (stabilna, O(limit)).
7. **Streak** = kolejne dni `closed` wstecz od „dziś"; dzień w toku nie zrywa serii (mierzy rytuał, nie wynik).
8. **Prisma 6.19.3** (nie 7 — otwarte bugi ESM/tsx); upgrade jako osobny dług.
9. **Migracje na starcie kontenera** (bez płatnego preDeploy Rendera).
10. **`DATABASE_URL` = `DIRECT_URL`** (bezpośrednie połączenie) — długo żyjący kontener trzyma własną pulę, pooler zbędny przy tej skali.

## 8. Jakość i proces

- **Testy: 127** — `packages/shared` 15 + `apps/api` 35 (w tym integracja na realnym Postgresie) + `apps/web` 77.
- **Proces**: każda zmiana przez gałąź → **PR** → **code review @cr (Fable 5)** → adres NIT-ów → merge (squash) po **zielonym CI** (oba joby). Decyzje architektoniczne/produktowe → **@sa (Fable 5)**. Implementacja FE na Opus 4.8.
- **„Done" = zweryfikowane**: typecheck + lint + testy + build zielone; na koniec **smoke test E2E na produkcji** (rejestracja → poranek → wieczór → historia → streak) przeszedł komplet.

## 9. Rejestr PR-ów (Faza 0 + 1)

Fundament/backend: BE-3…17, FND-5b/6/7, FE-1…5 (PR #1–#19).
Frontend dziennika: FE-6/7/9 (#20), FE-8 + edycja (#21), FE-10/11/12 (#22), FE-13 (#24).
Poprawki produkcyjne: backup PG18 (#26, #27). Dokumentacja: #19, #23, #25.

## 10. Co zostało (nieblokujące)

- **FND-7 „done"**: testowy restore z dumpa (procedura w `docs/DEPLOY.md`, PG18).
- **Higiena**: rotacja hasła Neona (przewijało się jawnie) → podmiana sekretów.
- **Sprzątanie**: konto `smoke-*@test.local` w prod DB (izolowane, po smoke teście).
- **Dług techniczny** (`docs/backlog_mvp.md`): kody błędów API → wspólny `z.enum`; powrót fokusu dla błędów spoza tytułów; upgrade Prisma 6→7; edge przesunięcia strefy czasowej wstecz.

## 11. Dalej (poza MVP)
Faza 2 — system punktów (ledger). Faza 3 — koło ratunkowe + panel admina. Faza 4 — statystyki/eksport. Szczegóły: `CLAUDE.md` §8, `docs/BUSINESS.md`.
