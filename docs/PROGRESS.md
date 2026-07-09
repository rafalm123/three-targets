# Progress & Handoff — Trzy Cele

> Stan na **2026-07-09**. Dokument żywy — źródło prawdy „gdzie jesteśmy / co zostało / jak kontynuować".
> Dla nowego agenta (zwłaszcza frontendowego): **przeczytaj to najpierw**, potem `CLAUDE.md`.

## TL;DR

- **Backend Fazy 1 (MVP) — KOMPLETNY.** Wszystkie endpointy dziennika + auth + kontrakty gotowe,
  przetestowane (unit 35, integracja 35 na realnym Postgresie), na `main`.
- **Infrastruktura — gotowa w repo.** Deploy (FND-6) i backup (FND-7) skonfigurowane; **uruchomienie
  czeka na właściciela** (konto Render + sekret Neona).
- **Frontend — fundament gotowy (auth), widoki dziennika DO ZROBIENIA.** To jedyny brakujący kawałek
  *funkcji* MVP „zapisywania celów".

## Co jest ZROBIONE (na `main`, zweryfikowane)

### Backend — wszystkie endpointy (prefix `/api`)
| Endpoint | Co robi | Request (kontrakt) | Odpowiedź / błędy |
|---|---|---|---|
| `POST /days` | wpis poranny (tworzy dzień „dziś") | `morningEntrySchema` | 201 `daySchema` (goły `Day`) · 409 `DAY_ALREADY_EXISTS` · 400 · 401 |
| `GET /days/today` | dzień „dzisiaj" | — | 200 `dayResponseSchema` (`{day: Day\|null}`) · 401 |
| `GET /days/:date` | pełny dzień po dacie (historia szczegół) | param `date` (`YYYY-MM-DD`, ≤ dziś) | 200 `dayResponseSchema` · 400 `FUTURE_DATE`/walidacja · 401 |
| `PATCH /days/today` | edycja poranna (**pełne zastąpienie**) | `morningEntrySchema` | 200 `daySchema` · 404 `NO_DAY_TODAY` · 409 `DAY_ALREADY_CLOSED` · 401 |
| `POST /days/today/evening` | wieczorne odznaczenie → dzień `closed` | `eveningEntrySchema` | 200 `daySchema` · 404 `NO_DAY_TODAY` · 409 `DAY_ALREADY_CLOSED` · 400 `GOAL_MISMATCH` · 401 |
| `GET /days/history` | historia (podsumowania, bez notatek) | query `?before=YYYY-MM-DD&limit=` (≤100, dom.30) | 200 `dayHistorySchema` (`{items, nextCursor}`) · 401 |
| `GET /stats/streak` | licznik/seria | — | 200 `streakSchema` (`{current,longest,totalDays,asOfDate}`) · 401 |
| `/auth/*` | Better Auth (login/register/session/logout) | — | obsługiwane przez `authClient` na FE |

Kod: `apps/api/src/routes/{days,stats,auth,me,health}.ts`. Reguły dnia: `apps/api/src/lib/day-service.ts`
(guard mutacji) + `day-boundary.ts` (granica doby, streak w `streak.ts`).

### Infrastruktura
- **FND-6 deploy:** `render.yaml` (Blueprint, jeden kontener API+SPA), `apps/api/Dockerfile`,
  `apps/api/docker-entrypoint.sh` (`prisma migrate deploy` na starcie). Zweryfikowane lokalnie.
- **FND-7 backup:** `.github/workflows/backup.yml` (cron `pg_dump` → artifact).
- **CI:** `.github/workflows/ci.yml` — job `quality` (lint/typecheck/test/build) + `integration`
  (Postgres 17 service container). Zielone.
- Instrukcje deployu/backupu (kroki właściciela): **`docs/DEPLOY.md`**.

### Frontend — FUNDAMENT (FE-1…FE-5, na `main`)
- Auth UI: `routes/login-page.tsx`, `register-page.tsx`, `guards.tsx` (`ProtectedRoute`/`PublicOnlyRoute`),
  `App.tsx` (routing), `components/app-shell.tsx`, `components/states.tsx` (stany UI), `styles.css` (design tokens).
- Klient auth: `lib/auth-client.ts` (`authClient`, `useSession`, `SessionUser`), `lib/auth-errors.ts`.
- `routes/home-page.tsx` — **placeholder** po zalogowaniu („widoki dziennika dojdą w kolejnej fazie").

## Co ZOSTAŁO

### Frontend — widoki dziennika (FE-6…FE-12) — GŁÓWNE ZADANIE
Wszystkie „→ po BE-x" mają już backend gotowy. Nie istnieje jeszcze **żaden klient API dnia**
(tylko auth) — trzeba go dodać (`apps/web/src/lib/` — np. `api.ts` uderzający w `/api/days*`, `/api/stats/streak`).

| # | Widok | Endpoint(y) | Kontrakt |
|---|---|---|---|
| FE-6 | Layout + nawigacja (dziś/historia), responsywny | — | — |
| FE-7 | „Rano": formularz 1 główny + 2 poboczne + notatki | `POST /days` (+ `PATCH /days/today` do edycji) | `morningEntrySchema` |
| FE-8 | „Wieczór": odznaczanie 3 celów + notatka | `POST /days/today/evening` | `eveningEntrySchema` (`goals[].id` z dnia!) |
| FE-9 | Widok dnia dzisiejszego (kieruje do akcji) | `GET /days/today` | `dayResponseSchema` (`day===null` → „wypełnij rano") |
| FE-10 | Historia + podgląd dnia | `GET /days/history` + `GET /days/:date` | `dayHistorySchema` / `dayResponseSchema` |
| FE-11 | Licznik/seria | `GET /stats/streak` | `streakSchema` |
| FE-12 | Dopracowanie stanów (ładowanie/pusto/błąd/walidacja) | — | reuse `components/states.tsx` |

### Owner-gated (poza kodem, robi właściciel — patrz `docs/DEPLOY.md`)
- **Deploy:** konto Render + Blueprint + 4 sekrety. (Do używania poza localhostem; lokalnie FE działa bez tego.)
- **Backup:** sekret `BACKUP_DATABASE_URL` + testowy restore.

**Faza 1 domyka się**, gdy FE-6…12 są gotowe i pełny rytuał (rano→wieczór→historia→streak) da się przeklikać E2E.

## Jak uruchomić lokalnie (dev)

```bash
# wymagane: Node 22+, pnpm, runtime kontenerów (Colima: `colima start`)
pnpm install
cp apps/api/.env.example apps/api/.env     # DATABASE_URL/DIRECT_URL (lokalny Postgres), sekrety Better Auth
docker compose up -d db                     # lokalny Postgres 17
pnpm --filter @trzy-cele/api db:migrate     # migracje (lub: prisma migrate deploy)
pnpm dev                                     # api (:3000) + web (Vite :5173, proxy /api → :3000)
```
FE woła API **same-origin** przez proxy Vite (`apps/web/vite.config.ts`: `/api` → `localhost:3000`).
Auth: `authClient`/`useSession` z `lib/auth-client.ts` (bez `baseURL` — same-origin; NIE dodawać `baseURL`,
Better Auth 1.6.23 crashuje na względnym URL).

## Konwencje i pułapki (WAŻNE dla FE)

- **Kontrakty = jedno źródło prawdy** w `packages/shared` (schematy zod + typy). Importuj z `@trzy-cele/shared`,
  NIE duplikuj kształtów. Walidacja formularzy: użyj tych samych schematów (`safeParse`).
- **Koperty odpowiedzi niespójne świadomie:** `POST /days` zwraca *goły* `Day` (201); `GET /days/today`
  i `GET /days/:date` zwracają `{ day: Day | null }`. Wieczór/edycja zwracają *goły* `Day` (200).
- **Stany dnia:** `evening_pending` → `closed`. „Przed wpisem porannym" = **brak dnia** (`day: null`),
  nie osobny status. `closed` niemutowalny (edycja/wieczór po zamknięciu → 409). Mutacje tylko „dziś".
- **Strefa czasowa:** „dziś" wyznacza **serwer** z `users.timezone` (ustawiane przy rejestracji). FE nie
  wysyła daty dla „dziś" — po prostu woła `/days/today`. `timezone` jest wymagane w formularzu rejestracji (już jest).
- **Wieczór (FE-8):** `eveningEntrySchema.goals` to **dokładnie 3** obiekty `{id, completed, completedNote?}`,
  gdzie `id` to id celów z pobranego dnia (`GET /days/today`). Złe/niepełne id → 400 `GOAL_MISMATCH`.
- **PATCH = pełne zastąpienie** (nie merge): pominięte pola opcjonalne (np. `morningNote`, `note`) → `null`.
- **Historia** NIE zawiera „dziś" i NIE ma pełnych notatek (tylko `mainTitle` + flagi `goalsCompleted`);
  szczegóły dnia z przeszłości pobierasz przez `GET /days/:date`.
- **Streak:** `current` liczy wstecz od „dziś"; „dziś" niezamknięte NIE zrywa serii (grace tylko dla dziś).
- **Higiena worktree:** pracuj na swojej gałęzi/worktree; przed commitem `git status` — nie wciągaj cudzych
  plików. `.claude/` jest w `.gitignore`.

## Proces pracy (obowiązuje)

1. Gałąź z `main` → implementacja → **PR do `main`** (nie push bezpośrednio na `main`).
2. Po każdym commicie/PR: **@cr** (code review, model **Fable 5**). Gdy czegoś nie wiesz / decyzja
   architektoniczna: **@sa** (solution architect, **Fable 5**). FE implementuje na **Opus 4.8**.
3. Adresuj NIT-y CR, dopiero potem merge (squash, `--delete-branch`) po zielonym CI (oba joby).
4. „Done" = testy + lint + typecheck przechodzą. Testy FE: **vitest** (wzorce: `*.test.tsx` obok komponentów,
   np. `login-page.test.tsx`, `guards.test.tsx`; `vitest.setup.ts`).
5. Decyzji architektonicznych nie zmieniaj bez zgody właściciela.

## Wzorce do naśladowania (istniejący FE)
- Ekran owija się w `AppShell` (`components/app-shell.tsx`); nagłówek dostaje `headerActions`.
- Stany ładowania/pusto/błąd: `components/states.tsx`.
- Obsługa błędów sieci vs HTTP: patrz `home-page.tsx`/`login-page.tsx` (try/catch na rzucających metodach).
- Style: klasy z `styles.css` (`button`, `button-secondary`, `form-error`, …) — trzymaj się tokenów.
