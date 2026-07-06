# Trzy Cele — dokumentacja techniczna projektu (CLAUDE.md)

> Źródło prawdy o architekturze, stacku, konwencjach i setupie.
> Dokument **żywy** — aktualizowany po każdej decyzji/zmianie.
> Odbiorcy: backendowiec, frontendowiec, przyszli kontrybutorzy (i AI).
>
> Rev. po recenzji planu (fable 5) — patrz `docs/PLAN_REVIEW_CONTEXT.md`.

---

## 1. Cel i zakres

Prywatna aplikacja-dziennik „trzy dzienne cele" (1 główny + 2 poboczne, odznaczane wieczorem).
Skala: **1 użytkownik teraz, max kilka w przyszłości** — nie SaaS. Priorytety, w kolejności:

1. **Niski koszt** (docelowo ~0 zł/mies.).
2. **Portowalność / brak vendor lock-in** (przeniesienie hostingu = zmiana konfiguracji, nie kodu).
3. **Prostota** — nie budujemy pod skalę, której nie ma.

Kontekst nietechniczny i pytania produktowe: **`docs/BUSINESS.md`**.

---

## 2. Stack (decyzje zatwierdzone)

| Warstwa | Wybór | Uzasadnienie |
|---------|-------|--------------|
| **Monorepo** | `pnpm` workspaces (`apps/api`, `apps/web`, `packages/shared`) | Współdzielone typy API → end-to-end type safety. Główny argument za TS. |
| **Frontend** | React + Vite (SPA), responsywny | Aplikacja za loginem → brak SEO → Next.js zbędny. |
| **Backend** | **Node.js + TypeScript + Fastify + zod** (decyzja @sa, 2026-07-03) | zod jest first-class w Fastify → jedno źródło kontraktu z `packages/shared` (Nest wymuszałby duplikację DTO przez `class-validator`, łamiąc „kontrakt raz"). Proporcjonalne do ~12 endpointów, lżejszy cold start na Render free. Guardy roli admina (Faza 3) = cienki `preHandler`, nie powód na Nesta. **Konwencja warstw obowiązkowa od 1. endpointu:** route → handler → service → Prisma. |
| **Deploy (kluczowa zmiana po recenzji)** | **Jeden kontener** serwujący API (`/api/*`) **oraz statyczne pliki SPA** (`/`) | Same-origin → **znika CORS i problem cross-site cookies (Safari/ITP)**. Prostsze, tańsze (statyk z tego samego kontenera = 0 zł), jeden deploy. |
| **Baza** | PostgreSQL (Neon — serverless, free, scale-to-zero) | Czysty Postgres = zero lock-inu, `pg_dump` przenosi gdziekolwiek. Neon > Supabase (Supabase pauzuje projekt po tygodniu). |
| **ORM** | **Prisma — pin `6.19.3`** (decyzja @sa, 2026-07-06) | Type-safe, dobry DX. Prisma 7 świadomie odłożony (otwarte bugi ESM/tsx w naszym stacku tsx+ESM: prisma/prisma #28670, #28627); upgrade 6→7 jako osobny task z kryteriami wyjścia — patrz `docs/backlog_mvp.md`. |
| **Auth** | **Better Auth** (biblioteka we własnej bazie), **wersja pinowana** | Tożsamość w naszym kodzie/bazie, nie u zewnętrznego SaaS. Biblioteka żywa, ale szybko mutuje (wydania co ~2 mies.) → pin wersji, upgrade jako świadome zadanie. |
| **Hosting** | **Render (free tier)** | Prawdziwy darmowy plan. (Railway odrzucony — po trialu płatny $5/mies., nie spełnia „~0 zł".) |
| **CI/CD** | GitHub Actions | Niezależne od chmury. |
| **IaC** | **Świadomie pomijamy Terraform na tym etapie** | Przy 1 kontenerze + PaaS to over-engineering. Portowalność daje Docker + Postgres + Better Auth. |

**⚠️ Trade-off cold start:** Render free usypia kontener po ~15 min → wybudzenie 30–50 s. Dla dziennika
używanego rano i wieczorem oznacza to, że **niemal każde wejście trafia w zimny start**. Akceptujemy to
świadomie na start. Plan B, gdyby uwierało: (a) cron GitHub Actions pingujący `/health` w porach porannych/wieczornych,
(b) migracja na **VPS Hetzner (~4,5 €/mies.)** — zero cold startów, pełna kontrola; dzięki Dockerowi decyzja odwracalna.

### Alternatywa hostingu
1× VPS Hetzner (~4,5 €/mies.) + docker-compose + Caddy (auto-TLS) — stały koszt, zero cold startów, odrobina ops.

### Świadomie ODRZUCONE
- **Next.js** — brak potrzeby SSR/SEO.
- **Dwa osobne hostingi FE/BE (dwie domeny)** — generowały problem cross-site cookies (Safari) i CORS za darmo. Zastąpione jednym kontenerem.
- **Railway** — brak realnego free tier.
- **Cognito / DynamoDB / Lambda / CDK** — vendor lock-in AWS.
- **Clerk / Auth0** — zewnętrzny SaaS auth.
- **Firmowy AWS jako hosting** — ryzyko (rachunki widoczne dla pracodawcy, utrata przy zmianie pracy). Patrz `docs/BUSINESS.md` §6.
- **Przypomnienia / scheduler / PWA / offline** — poza zakresem (to dziennik).

### Świadomie ZAAKCEPTOWANE RYZYKA (decyzje właściciela)
- **Brak blokad antybotowych / blokady rejestracji / rate-limitingu** — apka prywatna, mała skala. Reagujemy na bieżąco, jeśli pojawi się realny problem. *(Do rewizji, gdyby apka była udostępniana szerzej.)*

---

## 3. Architektura (wysoki poziom)

```
Przeglądarka — React + Vite (SPA)
      │  HTTPS/JSON · SAME-ORIGIN · ciasteczko sesji (HttpOnly, SameSite=Lax, Secure w prod)
      ▼
┌─────────────────────────────────────────────┐
│ JEDEN kontener Docker (Render)               │
│   Backend (Fastify) + Better Auth            │
│     • /api/*  → API                          │
│     • /       → statyczne pliki zbudowanej SPA│
└─────────────────────────────────────────────┘
      │  Prisma
      ▼
PostgreSQL (Neon)

  packages/shared: typy/kontrakty API współdzielone FE↔BE
```

- **Same-origin** (SPA i API pod tą samą domeną) → **brak CORS**, ciasteczko sesji jest first-party (działa w Safari).
- **Dev:** Vite dev-server z proxy `/api` → backend (hot reload). **Prod:** backend serwuje zbudowany statyk SPA.
- Podział *kodu* FE/BE zachowany (dwóch devów pracuje niezależnie); łączy ich kontrakt w `packages/shared`.
- Auth: sesje Better Auth (ciasteczka HttpOnly) w naszej bazie. Role: `user` | `admin`.
- Granica doby: „dzień" = lokalna data użytkownika; **„dzisiaj" wyznacza serwer** na podstawie `users.timezone` (IANA).

---

## 4. Model danych (forward-compatible pod przyszłe punkty — MVP nie wymaga późniejszej migracji)

> Cele jako osobna tabela (nie sztywne kolumny) → elastyczność i punktacja per-cel.
> Punkty jako **append-only ledger** (event sourcing) → brak desynchronizacji licznika.

- **Model użytkownika — współwłasność z Better Auth** (decyzja przed BE-3, 2026-07-06): tabele `user`, `session`, `account`, `verification` **generowane z konfiguracji Better Auth** (`apps/api/src/lib/auth.ts`, wersja pinowana) → schemat Prisma → migracja. Pola domenowe dokładane do modelu `user` jako `additionalFields`:
  - `role` (`user`|`admin`, default `user`, `input:false`) — konwencja zgodna z pluginem admina Better Auth (pod Fazę 3),
  - `timezone` (IANA, **wymagane**, `input:true`, ustawiane przy rejestracji) — autorytet dla granicy doby (BE-16).
  `displayName` realizowane wbudowanym polem `name`. Migracje **wyłącznie przez Prisma Migrate**; upgrade Better Auth = świadome zadanie (przegląd diffu schematu). Wszystkie tabele domenowe (`days`, `point_events`, `lifeline_usage`) kluczują po `id` użytkownika Better Auth (typ tekstowy).
- **`days`** — `id, userId, date (lokalna data), morningNote, eveningNote, status`. Unikat: `(userId, date)`.
  - **`status` = jawna maszyna stanów:** `morning_pending` → `evening_pending` → `closed`.
    Przełączana akcjami: zapis poranny (`morning_pending`→`evening_pending`), wieczorne odznaczenie (`→closed`).
    (Nie jest to „licznik", więc trzymamy jawnie, ale reguły przejść są zdefiniowane w jednym miejscu.)
- **`goals`** — `id, dayId, kind (main|secondary), position, title, note, completed (bool|null), completedNote`.
- **`point_events`** *(poza MVP)* — append-only ledger: `id, userId, dayId, delta, reason, createdBy, createdAt`.
  - **`delta` jako INTEGER w „półpunktach"** (poboczny wykonany = `+1`, kara za główny = `−2`) **lub `NUMERIC`** — **nigdy float** (sumowanie floatów w saldzie = błędy zaokrągleń). Prezentacja dzieli przez 2.
  - Saldo i historia liczone z eventów.
- **`lifeline_usage`** *(poza MVP)* — `id, userId, yearMonth, dayId` — limit 1 koło/miesiąc.

**Streak / licznik dni** liczymy z `days` (nie trzymamy w osobnym polu → brak rozjazdu).

---

## 5. Struktura repo (docelowa)

```
trzy-cele/
├─ apps/
│  ├─ api/            # backend (NestJS/Fastify) + Prisma + Better Auth; w prod serwuje też statyk SPA
│  │  ├─ prisma/schema.prisma
│  │  ├─ src/
│  │  └─ Dockerfile
│  └─ web/            # React + Vite (SPA)
│     └─ src/
├─ packages/
│  └─ shared/         # typy/kontrakty API (schematy zod + wyinferowane typy)
├─ docs/
│  ├─ BUSINESS.md            # dokumentacja nietechniczna
│  ├─ backlog_mvp.md         # backlog MVP
│  └─ PLAN_REVIEW_CONTEXT.md # brief + recenzja planu
├─ .github/workflows/ # CI/CD (GitHub Actions)
├─ docker-compose.yml # dev/test: api + lokalny Postgres (dowód portowalności)
├─ pnpm-workspace.yaml
├─ package.json
└─ CLAUDE.md          # ten plik
```

---

## 6. Konwencje

- **Język:** TypeScript wszędzie (`strict: true`). Zero `any` bez uzasadnienia w komentarzu.
- **Lint/format:** ESLint + Prettier, pre-commit hook. FE i BE dzielą bazową konfigurację.
- **Walidacja:** DTO walidowane po stronie API (**zod v4** — decyzja 2026-07-03; zgodność zweryfikowana z `fastify-type-provider-zod` i Better Auth ≥1.3.3, które same są już na v4). Env-vary walidowane `zod` na starcie aplikacji.
- **Kontrakty API:** definiowane raz w `packages/shared` (schematy zod + typy), importowane przez FE i BE.
- **Migracje bazy:** wyłącznie przez Prisma Migrate. Ręczne zmiany w bazie zabronione.
- **Sekrety:** `.env` lokalnie (nigdy w repo), zmienne środowiskowe u dostawcy hostingu. `.env.example` w repo.
- **Wersje zależności krytycznych** (Better Auth, Prisma): **pinowane**, upgrade jako świadome zadanie.
- **Commity:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`…).
- **Testy:** unit (najwięcej) — **logikę licznika dni i granicy doby testujemy PRZED implementacją** (najłatwiejsze miejsce na bugi). Integracyjne API↔DB w CI (Postgres jako *service container* GitHub Actions; lokalnie ten sam obraz przez docker-compose). **E2E: poza zakresem do końca Fazy 1.**
- **„Done" = zweryfikowane:** testy + lint przechodzą.

---

## 7. Setup lokalny (do uzupełnienia przy Fazie 0)

> Placeholder — konkretne komendy dopiszemy przy walking skeletonie.

```bash
# wymagane: Node 22+ (LTS), pnpm, runtime kontenerów zgodny z OCI dla lokalnego Postgresu przez docker-compose
# macOS: rekomendowana Colima (MIT/Apache, bezpieczna komercyjnie) — `brew install colima docker`; działają też OrbStack / Docker Desktop
pnpm install
cp apps/api/.env.example apps/api/.env   # uzupełnić DATABASE_URL, sekrety Better Auth
docker compose up -d db      # lokalny Postgres
pnpm --filter api prisma migrate dev
pnpm dev                     # api + web (Vite proxy /api → api)
```

---

## 8. Roadmapa (techniczna)

- **Faza 0 — Walking Skeleton:** monorepo, CI, docker-compose (lokalny Postgres), Better Auth + Neon, jeden kontener (API+statyk), deploy E2E na Render z działającym logowaniem, backup bazy. *Najpierw dowodzimy że pipeline działa, potem funkcje.*
- **Faza 1 — MVP:** logowanie · rano 1 główny + 2 poboczne + notatki · wieczorem done/not + notatka · historia/dziennik · licznik dni/streak.
- **Faza 2 — Punkty:** ledger (integer/półpunkty), +poboczne, −niewykonany główny, suma + streak.
- **Faza 3 — Koło ratunkowe + Admin:** lifeline 1/mies., rola admina (anulowanie kary, audyt).
- **Faza 4 — Polish:** statystyki/wykresy, eksport dziennika (JSON = też ręczny backup).

---

## 9. Otwarte decyzje wpływające na kod

Zależne od odpowiedzi biznesu (patrz `docs/BUSINESS.md` §4) — dotyczą logiki `point_events`:

1. Asymetria punktów (główny wykonany = 0 czy +?).
2. Brak wieczornego przeglądu = `main_missed` (−) czy stan neutralny?
3. Koło ratunkowe: wyzwalane ręcznie przez usera czy automatycznie?

Do czasu decyzji: **Faza 0 i 1 nie zależą od punktów** — możemy ruszać bez blokady.
