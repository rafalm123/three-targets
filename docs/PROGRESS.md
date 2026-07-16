# Progress & Handoff — Trzy Cele

> Stan na **2026-07-16** (BE-21: oznaczanie per-cel + okno łaski „wczoraj" wdrożone). Dokument żywy — źródło prawdy
> „gdzie jesteśmy / co zostało / jak kontynuować". Dla nowego agenta: **przeczytaj to najpierw**, potem `CLAUDE.md`.

## TL;DR

- **Faza 1 (MVP) — DOMKNIĘTA I WDROŻONA NA PRODUKCJI** → **https://trzy-cele.onrender.com**
  (Render free, jeden kontener API+SPA, Neon PG18). Smoke test E2E na prodzie przeszedł komplet = kryterium @sa.
- **Sesja 2026-07-11…13 — WDROŻONA NA PRODUKCJI** (3 commity; pełny rejestr: `docs/PHASE2_SUMMARY.md`):
  - **Streak z dowiezionego głównego** (BE-18) — mierzy cel główny, nie sam rytuał; poboczne bez znaczenia.
  - **Edycja dnia „dziś" po zamknięciu** (BE-19) — niemutowalność po dacie, przeszłość zamrożona strukturalnie.
  - **Ręczny reset serii** (BE-20) — `POST /api/stats/streak/reset`, `floor=dziś` (odcina przeszłość, dziś liczy).
  - **Faza 2 „Lista celów"** — 30-dniowe wyzwanie punktowe; punkty za poboczne (+1, główny 0, **bez kar**),
    liczone derywacyjnie z `days`/`goals` (bez ledgera); progi nagród co 10; jedna aktywna + historia.
- **Sesja 2026-07-16 — BE-21 — WDROŻONA NA PRODUKCJI** (PR #29 squash-merged; smoke 14/14 zielone):
  - **Oznaczanie celów per-cel** (`PATCH /days/:date/goals/:goalId`) — natychmiastowy zapis `completed`, odpięty od zamknięcia dnia; „Zamknij dzień" = opcjonalne domknięcie (koniec all-or-nothing).
  - **Seria z `main.completed` niezależnie od `closed`** — kliknięcie głównego od razu wchodzi do serii.
  - **Okno łaski „wczoraj-jeśli-`evening_pending`"** — można domknąć/oznaczyć zapomniany wczorajszy dzień; wpp. `403 DAY_FROZEN`. FE: baner „Dokończ wczorajszy dzień".
  - `GOAL_MISMATCH` → `GOAL_NOT_IN_DAY`. Punkty i seria derywacyjne → backfill przelicza się sam (bez migracji).
- Testy (zielone): shared 41 + api 66 unit + 86 integracja + web 138. Review @cr (Fable 5): **APPROVE** (NIT-y TOCTOU/IDOR-test/FUTURE_DATE domknięte). Smoke prod 14/14 (seria z głównego bez zamknięcia, `GOAL_NOT_IN_DAY`/`FUTURE_DATE`/`DAY_FROZEN`, opcjonalne domknięcie, regresja BE-19).
- Testy poprzedniej sesji: shared 34 + api 59 unit + 66 integracja + web 125. Review @cr (Fable 5) BE+FE. Smoke E2E 15/15.
- **Zostaje (nieblokujące):** UI edycji aktywnej listy (PATCH + klient gotowe, brak ekranu; `docs/backlog_mvp.md`);
  z Fazy 1: testowy restore backupu (FND-7 „done"), rotacja hasła Neona, dług techniczny.

## Co jest ZROBIONE (na `main`, zweryfikowane)

### Backend — wszystkie endpointy (prefix `/api`)
| Endpoint | Co robi | Request (kontrakt) | Odpowiedź / błędy |
|---|---|---|---|
| `POST /days` | wpis poranny (tworzy dzień „dziś") | `morningEntrySchema` | 201 `daySchema` (goły `Day`) · 409 `DAY_ALREADY_EXISTS` · 400 · 401 |
| `GET /days/today` | dzień „dzisiaj" | — | 200 `dayResponseSchema` (`{day: Day\|null}`) · 401 |
| `GET /days/:date` | pełny dzień po dacie (historia szczegół) | param `date` (`YYYY-MM-DD`, ≤ dziś) | 200 `dayResponseSchema` · 400 `FUTURE_DATE`/walidacja · 401 |
| `PATCH /days/:date` (+ kompat `/days/today`) | edycja poranna (**pełne zastąpienie**) | `morningEntrySchema` | 200 `daySchema` · 404 `NO_DAY_TODAY` · 403 `DAY_FROZEN` · 409 `DAY_ALREADY_CLOSED` · 401 |
| `PATCH /days/:date/goals/:goalId` **(BE-21)** | oznaczenie **pojedynczego** celu (natychmiast, bez zmiany statusu) | `goalMarkPatchSchema` `{completed, completedNote?}` | 200 `daySchema` · 404 `NO_DAY_TODAY` · 403 `DAY_FROZEN` · 400 `GOAL_NOT_IN_DAY` · 401 |
| `POST /days/:date/evening` (+ kompat `/days/today/evening`) | **opcjonalne** domknięcie: podzbiór 0..3 oznaczeń + notatka wieczorna → `closed` | `eveningEntrySchema` (`goals` 0..3) | 200 `daySchema` · 404 `NO_DAY_TODAY` · 403 `DAY_FROZEN` · 409 `DAY_ALREADY_CLOSED` · 400 `GOAL_NOT_IN_DAY` · 401 |
| `GET /days/history` | historia (podsumowania, bez notatek) | query `?before=YYYY-MM-DD&limit=` (≤100, dom.30) | 200 `dayHistorySchema` (`{items, nextCursor}`) · 401 |
| `GET /stats/streak` | licznik/seria (dowieziony główny; BE-18) | — | 200 `streakSchema` (`{current,longest,totalDays,asOfDate}`) · 401 |
| `POST /stats/streak/reset` | ręczny reset serii (BE-20, `floor=dziś`) | — | 200 `streakSchema` · 401 |
| `POST /challenges` | utwórz 30-dniowe wyzwanie (Faza 2) | `challengeCreateSchema` | 201 `challengeWithPointsSchema` · 409 `ACTIVE_CHALLENGE_EXISTS` · 400 · 401 |
| `GET /challenges/active` | aktywne wyzwanie z punktami/progami | — | 200 `{challenge: ChallengeWithPoints\|null}` · 401 |
| `GET /challenges` | historia zakończonych wyzwań | — | 200 `challengeListSchema` (`{items}`) · 401 |
| `GET /challenges/:id` | szczegóły własnego wyzwania | param `id` | 200 `{challenge: …\|null}` · 401 |
| `PATCH /challenges/:id` | edycja tytułu/nagród aktywnego | `challengeUpdateSchema` | 200 `challengeWithPointsSchema` · 404 `CHALLENGE_NOT_EDITABLE` · 401 |
| `/auth/*` | Better Auth (login/register/session/logout) | — | obsługiwane przez `authClient` na FE |

Kod: `apps/api/src/routes/{days,stats,challenges,auth,me,health}.ts`. Reguły dnia: `apps/api/src/lib/day-service.ts`
(guard mutacji po dacie — BE-19) + `day-boundary.ts` (granica doby). Streak: `streak.ts`/`stats-service.ts`.
Wyzwania: `points-service.ts` (czysta logika punktów) + `challenge-service.ts`.

### Infrastruktura
- **FND-6 deploy:** `render.yaml` (Blueprint, jeden kontener API+SPA), `apps/api/Dockerfile`,
  `apps/api/docker-entrypoint.sh` (`prisma migrate deploy` na starcie). Zweryfikowane lokalnie.
- **FND-7 backup:** `.github/workflows/backup.yml` (cron `pg_dump` → artifact).
- **CI:** `.github/workflows/ci.yml` — job `quality` (lint/typecheck/test/build) + `integration`
  (Postgres 17 service container). Zielone.
- Instrukcje deployu/backupu (kroki właściciela): **`docs/DEPLOY.md`**.

### Frontend — KOMPLETNY (FE-1…FE-13, na `main`)
- **Auth (FE-1…5):** `routes/{login,register}-page.tsx`, `guards.tsx`, `App.tsx`, `components/{app-shell,states}.tsx`,
  `styles.css`, `lib/{auth-client,auth-errors}.ts`.
- **Klient API dnia:** `lib/api.ts` — `getToday`/`createDay`/`updateMorning`/`submitEvening`/`getHistory`/`getDayByDate`/`getStreak`,
  walidacja odpowiedzi schematami z `@trzy-cele/shared`; `ApiRequestError` (kod/status) vs surowy rzut sieci.
- **Widoki dziennika (FE-6…13):**
  - FE-9 HUB `routes/today-page.tsx` (routing pod-stanów null/evening_pending/closed; pod-tryby view/edit/evening),
  - FE-7 `routes/morning-form.tsx` (poranek + edycja przez reuse), FE-8 `routes/evening-form.tsx` (jawny wybór 3 celów + licznik),
  - FE-10/13 `routes/history-page.tsx` (lista + keyset) + `routes/history-day-page.tsx` (szczegół na trasie `/historia/:date`),
  - FE-11 `components/streak-refresh.tsx` + StreakBadge (odświeżany po zamknięciu dnia),
  - `components/day-readonly.tsx` (reuse podglądu closed HUB↔historia), FE-6 nawigacja + wspólny `LogoutButton` w AppShell.

## Co ZOSTAŁO

### Owner-gated (poza kodem, robi właściciel — patrz `docs/DEPLOY.md`)
- **Deploy (Render):** konto + Blueprint + 4 sekrety. (Do używania poza localhostem; lokalnie działa bez tego.)
- **Backup (Neon):** sekret `BACKUP_DATABASE_URL` + **testowy restore** (= kryterium „done" backupu).
- **Smoke test na prodzie** po deployu (health + pełny rytuał `curl`-em) — testuje to, czego CI nie sprawdza (cold start, Secure cookies).

### Drobiazgi / dług techniczny (nieblokujące) — patrz `docs/backlog_mvp.md`
- Kody błędów API → wspólny `z.enum`/stałe w `packages/shared/src/error.ts`.
- FE: powrót fokusu dla błędów spoza tytułów (NIT-5).
- Edge stref czasowych (przesunięcie wstecz) — obserwacja dla @sa.

**Formalne zamknięcie Fazy 1 wg @sa** = pełny rytuał (rano→wieczór→historia→streak) przeklikany E2E **na prodzie**
+ zweryfikowany restore backupu. Kod jest gotowy; brakuje tylko akcji właściciela (deploy + sekrety).

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
- **Stany dnia (BE-21):** `evening_pending` → `closed`. „Przed wpisem porannym" = **brak dnia** (`day: null`),
  nie osobny status. Oznaczanie celów jest **per-cel i natychmiastowe** (`PATCH /days/:date/goals/:goalId`),
  odpięte od zamknięcia; `closed` = **opcjonalne** domknięcie (notatka wieczorna). Mutacje dozwolone dla
  **„dziś" oraz „wczoraj" dopóki `evening_pending`** (okno łaski); wpp. `403 DAY_FROZEN`. Seria liczy się
  z `main.completed=true` niezależnie od statusu. Stary kod `GOAL_MISMATCH` zastąpiony przez `GOAL_NOT_IN_DAY`.
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
