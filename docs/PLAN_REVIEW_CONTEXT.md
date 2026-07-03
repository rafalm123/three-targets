# Trzy Cele — brief dla Plan Reviewera

> **Cel tego dokumentu:** dać recenzentowi pełny kontekst, by ocenił czy plan (architektura,
> stack, zakres, kolejność) ma sens — bez potrzeby dopytywania. Sekcja 10 zawiera konkretne
> pytania, na które prosimy o odpowiedź. Nic tu nie jest jeszcze zaimplementowane — to faza planu.

> **⚠️ AKTUALIZACJA PO RECENZJI (fable 5).** Ten dokument opisuje stan *sprzed* recenzji.
> Przyjęte zmiany (obowiązuje `CLAUDE.md` i `backlog_mvp.md`): **jeden kontener** serwujący SPA + API
> (zamiast dwóch domen → znika CORS i problem cookies Safari) · **Render** zamiast Railway · cold start jako
> świadomy trade-off · punkty jako **integer/półpunkty** (nie float) · `days.status` jako maszyna stanów ·
> doba wyznaczana serwerowo z `users.timezone` · **pin wersji Better Auth** · Nest **lub** Fastify wg kompetencji dewa ·
> dodany **backup bazy** i **docker-compose z lokalnym Postgresem**.
> **Świadomie odrzucone przez właściciela:** blokady antybotowe / blokada rejestracji / rate limiting (mała prywatna apka).

---

## 1. Czym jest projekt (w skrócie)

Prywatna aplikacja-dziennik **„trzy dzienne cele"**: rano użytkownik wpisuje **1 cel główny + 2 poboczne**
(z opcjonalnymi notatkami), wieczorem odznacza co dowiózł. Do tego historia dni i licznik dni/serii.
Później (poza MVP) dochodzi system punktów, koło ratunkowe i konto admina.

Projekt powstaje w ramach nauki „vibe codingu" / budowania z AI. Autor jest software developerem
(TypeScript + Java). **Implementację wykonają osobno backendowiec i frontendowiec** — my dostarczamy
architekturę, decyzje i backlog.

## 2. Twarde wymagania i ograniczenia (rządzą całą architekturą)

| Wymaganie | Konsekwencja |
|-----------|--------------|
| **Niski koszt** (docelowo ~0 zł/mies.) | Free tier / scale-to-zero, minimum płatnych usług. |
| **Portowalność / brak vendor lock-in** (autor chce móc przepiąć hosting) | Docker + czyste standardy (Postgres, biblioteka auth we własnej bazie), **bez** natywnych usług AWS (bez CDK, Cognito, DynamoDB, Lambda-specyfiki). |
| **Prostota / mała skala** | 1 użytkownik teraz, max kilka później. **Nie SaaS.** Nie budujemy pod skalę, której nie ma. |
| **TypeScript** (kompetencje autora, uniwersalność web) | TS na FE i BE, współdzielone typy. |
| **Dziennik, nie app nawykowa** | Brak przypomnień/pushy/schedulera. Responsywny web, bez PWA/offline/natywnej apki. |

## 3. Kluczowe decyzje technologiczne + uzasadnienia

| Warstwa | Wybór | Dlaczego |
|---------|-------|----------|
| Monorepo | pnpm workspaces (api + web + shared typy) | End-to-end type safety FE↔BE — główny argument za TS. |
| Frontend | React + Vite (SPA), responsywny | Apka za loginem → brak SEO → Next.js zbędny. Statyk = 0 zł. |
| Backend | Node + TypeScript, NestJS | Struktura + guardy/role pod przyszłego admina i system punktów. (Fastify rozważany jako lżejszy — do decyzji dewa.) |
| Baza | PostgreSQL (Neon — serverless, free, scale-to-zero) | Czysty Postgres = zero lock-inu, `pg_dump` przenosi gdziekolwiek. Neon > Supabase (Supabase pauzuje projekt po tygodniu). |
| ORM | Prisma | Type-safe, dobry DX. |
| Auth | **Better Auth** (biblioteka we własnej bazie) | Sedno anty-lock-inu: tożsamość w naszym kodzie/bazie, nie u zewnętrznego SaaS. |
| Hosting BE | Kontener Docker → Render/Railway (hobby) | Zero-ops, near-zero koszt. Cold start nieistotny dla dziennika. |
| Hosting FE | Cloudflare Pages | Darmowy statyk. |
| CI/CD | GitHub Actions | Niezależne od chmury. |
| IaC | **Świadomie pominięty Terraform na tym etapie** | Przy 1 kontenerze + PaaS to over-engineering. Portowalność daje Docker + Postgres + Better Auth. |

**Alternatywa hostingu** (stały koszt/pełna kontrola): 1× VPS Hetzner (~4 €/mies.) + docker-compose + Caddy.

## 4. Świadomie ODRZUCONE (i dlaczego)

- **Next.js** — brak potrzeby SSR/SEO.
- **AWS-native: Cognito, DynamoDB, Lambda, CDK** — vendor lock-in (sprzeczne z wymaganiem portowalności).
- **Firmowy AWS jako hosting** — autor ma dostęp do AWS tylko w pracy; postawienie tam prywatnego projektu to ryzyko (rachunki widoczne dla pracodawcy, utrata dostępu przy zmianie pracy, ToS). Odradzone stanowczo.
- **Clerk / Auth0** — zewnętrzny SaaS auth = zależność.
- **Przypomnienia / scheduler / PWA / offline** — poza charakterem produktu (dziennik).

## 5. Mapa plików (co znaczy który dokument)

| Plik | Co zawiera | Dla kogo |
|------|-----------|----------|
| `CLAUDE.md` | Dokumentacja **techniczna**: stack, architektura, model danych, struktura repo, konwencje, roadmapa techniczna. | Devowie, AI |
| `docs/BUSINESS.md` | Dokumentacja **nietechniczna**: czym jest apka, system punktów, koszty, roadmapa, pytania produktowe. | Biznes/produkt |
| `docs/backlog_mvp.md` | **Backlog MVP** w stylu Jira: Fundament (Setup/DevOps + BE + FE) + Dziennik celów (BE + FE), z zależnościami i DoD. | Devowie |
| `docs/PLAN_REVIEW_CONTEXT.md` | **Ten plik** — brief dla recenzenta planu. | Reviewer |

## 6. Architektura (wysoki poziom)

```
React+Vite (SPA, statyk, Cloudflare Pages)
        │  HTTPS/JSON, ciasteczko sesji
        ▼
NestJS API + Better Auth (kontener Docker, Render/Railway)
        │  Prisma
        ▼
PostgreSQL (Neon)
   └── packages/shared: współdzielone typy/kontrakty API (FE↔BE)
```
- Czysty podział API ↔ SPA (dwóch devów pracuje niezależnie, kontrakt w `shared`).
- Auth: sesje Better Auth (ciasteczka HttpOnly) w naszej bazie. Role: `user` | `admin`.
- Granica doby: „dzień" = lokalna data kalendarzowa użytkownika (pole `timezone` w `users`).

## 7. Model danych (forward-compatible pod przyszłe punkty — MVP nie wymaga późniejszej migracji)

- **users** — id, email, displayName, role, timezone, createdAt (sesje/konta = Better Auth).
- **days** — id, userId, date (lokalna), morningNote, eveningNote, status. Unikat (userId, date).
- **goals** — id, dayId, kind (main|secondary), position, title, note, completed (bool|null), completedNote.
- **point_events** *(poza MVP)* — append-only ledger: delta (+0.5/−1), reason, createdBy. Saldo liczone z eventów.
- **lifeline_usage** *(poza MVP)* — limit 1 koło ratunkowe / miesiąc.

Streak/licznik dni liczony z `days` (nie trzymany w osobnym polu → brak rozjazdu).

## 8. Zakres MVP i co jest poza nim

**MVP:** logowanie · rano 1 główny + 2 poboczne + notatki · wieczorem odznaczenie done/not + notatka ·
historia dni · licznik dni. Poprzedzone „walking skeletonem" (fundament: repo, CI, auth, deploy E2E).

**Poza MVP (kolejne fazy):** system punktów (+0,5 poboczne / −1 niewykonany główny) → koło ratunkowe
(1/mies.) + panel admina → statystyki/wykresy + eksport dziennika.

## 9. Kolejność wdrożenia
1. **Faza 0 — Fundament / walking skeleton**: repo, CI, Docker, Better Auth + Neon, deploy E2E z działającym logowaniem. *Najpierw dowodzimy że pipeline działa, potem funkcje.*
2. **Faza 1 — MVP** (jak wyżej).
3. **Faza 2 — Punkty** → **Faza 3 — Koło ratunkowe + Admin** → **Faza 4 — Polish**.

## 10. 🔎 Pytania do recenzenta (na czym zależy nam najbardziej)

1. **Czy stack jest proporcjonalny do skali?** Dla „1 user, max kilka" — czy NestJS + monorepo + oddzielny FE/BE to nie przerost? Kiedy prościej byłoby pójść w monolit (np. jeden serwer serwujący też statyk) lub lżejszy backend (Fastify)?
2. **Better Auth** — dojrzałość/ryzyko biblioteki vs. wygoda anty-lock-inu. Czy to bezpieczny wybór na 2026, czy rekomendujecie coś innego przy zachowaniu „auth we własnej bazie"?
3. **Portowalność** — czy nasze środki (Docker + czysty Postgres + auth w bazie, bez Terraform) faktycznie realizują cel „przepięcie hostingu = zmiana konfiguracji, nie kodu"? Czego brakuje?
4. **Hosting** — Render/Railway (PaaS) vs. VPS Hetzner + docker-compose. Który lepszy dla near-zero kosztu + minimum ops przy tej skali?
5. **Model danych** — czy „cele jako osobna tabela" + „punkty jako append-only ledger" to nie over-engineering dla MVP? Czy odwrotnie — czy coś się zemści przy dodawaniu punktów?
6. **Granularność backlogu** — czy podział Fundamentu na tory Setup/DevOps + BE + FE (~20 tasków) jest realistyczny, czy coś istotnego pominięto (np. testy, sekrety, obserwowalność)?
7. **Kolejność** — czy „walking skeleton + deploy E2E najpierw, funkcje potem" jest słuszne, czy dla prywatnego pet-projektu to zbędny narzut na starcie?

## 11. Otwarte decyzje produktowe (nie blokują Fazy 0–1, ale wpłyną na punkty)
- Asymetria punktów: główny wykonany = 0 pkt, niewykonany = −1. Zamierzone?
- Brak wieczornego przeglądu = główny niewykonany (−1) czy stan neutralny?
- Koło ratunkowe: wyzwalane ręcznie przez usera czy automatycznie przy pierwszym braku w miesiącu?
