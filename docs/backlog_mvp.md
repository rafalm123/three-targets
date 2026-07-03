# Trzy Cele — Backlog MVP

> Zakres **tylko MVP**: logowanie · rano 1 cel główny + 2 poboczne + notatki · wieczorem
> odznaczenie dowieziony/nie + notatka · historia dni · licznik dni.
> **Poza MVP** (osobny backlog później): system punktów, koło ratunkowe, panel admina, statystyki, eksport.
>
> Taski w stylu Jira — opisują **co** zrobić, nie *jak*. Kontekst produktowy: `BUSINESS.md`, architektura: `../CLAUDE.md`.
> Legenda: „→ po X" = zacząć dopiero gdy X gotowe. „(wymaga kont)" = potrzebne konta/dostępy właściciela.
>
> Rev. po recenzji planu (fable 5): **jeden kontener (API + statyk SPA)** zamiast dwóch hostingów →
> znika CORS i osobny deploy FE; dodany **backup bazy** i **docker-compose z lokalnym Postgresem**.

---

## Definicja MVP
Użytkownik potrafi: założyć konto i zalogować się → rano zapisać 3 cele z notatkami →
wieczorem oznaczyć co dowiózł → przeglądać historię poprzednich dni → widzieć licznik dni.

---

# CZĘŚĆ 1 — FUNDAMENT (Walking Skeleton)
> Cel: działający end-to-end szkielet z logowaniem, wdrożony w chmurze jako jeden kontener. Zero logiki celów.

## 🟨 Tor A — Setup / DevOps (wspólny)
| # | Task | Definition of Done |
|---|------|--------------------|
| FND-1 | Inicjalizacja repo | Struktura (backend + frontend + wspólne typy), wspólny lint/format, projekt buduje się z zera. |
| FND-2 | Współdzielony kontrakt API | Miejsce na typy/kontrakty współdzielone przez FE i BE (schematy zod + typy). Zmiana kontraktu w jednym miejscu. |
| FND-3 | Środowisko dev + docker-compose | Lokalny Postgres uruchamiany deklaratywnie przez `docker-compose.yml` na dowolnym runtime zgodnym z OCI (**Colima** rekomendowana na macOS — MIT/Apache; OrbStack/Docker Desktop też działają) — jedną komendą. FE+BE odpalane jedną komendą (Vite proxy /api → backend). Instrukcja w README (rekomendowany runtime dla macOS). Zarazem **dowód portowalności** i baza do testów integracyjnych. |
| FND-4 | Baza w chmurze + połączenie | Baza (Neon) założona, aplikacja się łączy, dane połączenia jako sekret (nie w repo). (wymaga kont) |
| FND-5 | CI (lint + build + test) + harness testów | Na każdy push: lint, build, testy. Testy integracyjne z bazą: w CI Postgres jako **service container GitHub Actions** (nie docker-compose), z tej samej wersji obrazu co lokalnie. Czerwony pipeline blokuje merge. |
| FND-6 | Deploy: jeden kontener (API + statyk SPA) | Aplikacja wdrożona na **Render (free)** jako jeden kontener serwujący `/api/*` i statyczną SPA; sekrety/zmienne ustawione w środowisku. (wymaga kont) → po BE-8 |
| FND-7 | Backup bazy | Cykliczny (np. tygodniowy) `pg_dump` z crona GitHub Actions do prywatnego storage'u. Dane dziennika są niereprodukowalne → to polisa. |

## 🟦 Tor B — Backend fundament
| # | Task | Definition of Done |
|---|------|--------------------|
| BE-1 | Szkielet API + healthcheck | API startuje lokalnie, endpoint zdrowia zwraca OK. W prod dodatkowo serwuje statyczne pliki SPA. |
| BE-2 | Konfiguracja i sekrety | Aplikacja wczytuje i **waliduje** konfigurację/sekrety na starcie; brak wymaganej zmiennej = czytelny błąd. Wersje krytycznych zależności pinowane. |
| BE-3 | Schemat użytkownika + migracje | Tabela użytkowników (z `timezone`) tworzona migracją, odtwarzalną od zera. |
| BE-4 | Rejestracja / logowanie / wylogowanie / sesja | User zakłada konto, loguje się i wylogowuje; sesja utrzymana bezpiecznie (Better Auth, wersja pinowana). |
| BE-5 | „Kim jestem" + ochrona tras | Endpoint zwraca zalogowanego użytkownika; trasy chronione odrzucają gościa (401). |
| BE-6 | Ciasteczko sesji (same-origin) | Sesja w ciasteczku HttpOnly, `SameSite=Lax` — działa first-party (Safari OK). **Bez CORS** (jeden origin). |
| BE-7 | Obsługa błędów + logi | Spójny format odpowiedzi błędów; podstawowe logowanie zdarzeń/żądań. |
| BE-8 | Obraz produkcyjny (jeden kontener) | Backend + zbudowany statyk SPA w jednym obrazie gotowym do wdrożenia. **Uwaga (z code review FND-1):** rozstrzygnąć narzędzie budujące API do artefaktu runtime — rekomendacja `tsup`/`esbuild` bundlujący `apps/api` wraz z `@trzy-cele/shared` (shared eksportuje surowe `./src/*.ts`, więc goły `tsc` z `moduleResolution: bundler` nie wyprodukuje uruchamialnego wyjścia). → po BE-1, FE-1 |

## 🟩 Tor C — Frontend fundament
| # | Task | Definition of Done |
|---|------|--------------------|
| FE-1 | Szkielet aplikacji + build | Aplikacja startuje lokalnie (Vite proxy /api), buduje się do statyku serwowanego przez backend, łączy z API (health). |
| FE-2 | Klient API + obsługa sesji | Warstwa komunikacji z backendem (same-origin — bez cross-site cookies), obsługa 401. |
| FE-3 | Ekrany rejestracji / logowania / wylogowania | Formularze + obsługa błędów (złe dane, zajęty e-mail itp.). → po BE-4 |
| FE-4 | Trasy chronione + przekierowania | Gość → login; zalogowany → aplikacja. Odświeżenie strony nie wylogowuje. → po BE-5 |
| FE-5 | Szkielet layoutu + globalne stany | Główny układ (shell) + spójne stany ładowania/błędu do użycia w całej apce. |

---

# CZĘŚĆ 2 — DZIENNIK CELÓW (funkcje MVP)
> Cel: pełny cykl rano → wieczór + historia i licznik dni.

## 🟦 Backend
| # | Task | Definition of Done |
|---|------|--------------------|
| BE-9 | Model dnia i celów | Jeden dzień na użytkownika na datę (1 główny + 2 poboczne). `days.status` jako jawna maszyna stanów: `morning_pending` → `evening_pending` → `closed`. |
| BE-10 | Zapis porannego wpisu | Endpoint tworzy dzień: 1 główny + 2 poboczne + opcjonalne notatki. Walidacja: dokładnie 1 główny i 2 poboczne; jeden wpis na dzień. |
| BE-11 | Edycja porannego wpisu | Poprawa wpisu w ciągu tego samego dnia (stan `evening_pending`, przed zamknięciem). |
| BE-12 | Wieczorne odznaczenie | Endpoint oznacza każdy cel: dowieziony / nie + opcjonalna notatka; przełącza dzień na `closed`. |
| BE-13 | Pobranie dnia | Zwraca dzień (dzisiejszy lub po dacie) z celami i stanem. |
| BE-14 | Historia dni | Lista przeszłych dni od najnowszych, ze stronicowaniem. |
| BE-15 | Licznik dni | Zwraca licznik/serię dni (definicję „dnia liczonego" potwierdzić z biznesem). |
| BE-16 | Reguła doby | „Dzień" = lokalna data użytkownika; **„dzisiaj" wyznacza serwer** z `users.timezone`. Unikat `(userId, date)` chroni przed duplikatem. |

## 🟩 Frontend
| # | Task | Definition of Done |
|---|------|--------------------|
| FE-6 | Layout + nawigacja (responsywny) | Działa na telefonie i desktopie; nawigacja: dziś / historia. (można równolegle) |
| FE-7 | Widok „Rano" | Formularz 1 główny + 2 poboczne + notatki, z walidacją. → po BE-10 |
| FE-8 | Widok „Wieczór" | Odznaczanie każdego celu dowieziony/nie + notatka. → po BE-12 |
| FE-9 | Widok dnia dzisiejszego | Pokazuje stan dnia i kieruje do właściwej akcji (wypełnij rano / oznacz wieczór / zamknięty). → po BE-13 |
| FE-10 | Widok historii / dziennika | Lista przeszłych dni + podgląd szczegółów dnia. → po BE-14 |
| FE-11 | Licznik dni | Widoczny wskaźnik licznika/serii. → po BE-15 |
| FE-12 | Dopracowanie stanów UI | Ładowanie, pusto, błąd, walidacja — spójne w całej aplikacji. |

---

## Świadomie POZA zakresem / zaakceptowane ryzyko
- **Blokady antybotowe / blokada rejestracji / rate limiting** — pominięte świadomie (apka prywatna, mała skala). Reagujemy na bieżąco. *(Do rewizji, gdyby apka była udostępniana szerzej.)*
- **Testy E2E** — poza zakresem do końca Fazy 1. W MVP: testy unit (licznik dni, granica doby — pisane przed implementacją) + wybrane integracyjne API↔DB.

## Kolejność i praca równoległa
1. **Najpierw cały Fundament** (Część 1). Kolejność w torze B: BE-1→2→3→4→5. FE fundament rusza gdy jest auth (BE-4/5); FE-1/FE-5 można równolegle.
2. **Deploy jednego kontenera** (FND-6) po zbudowaniu obrazu (BE-8, który potrzebuje statyku z FE-1) — domyka walking skeleton. Backup (FND-7) zaraz po.
3. Dopiero potem **Dziennik celów** (Część 2). FE może budować layout i puste widoki (FE-6, FE-12) zanim BE skończy endpointy; podpięcie danych wg „→ po BE-x".
4. **Kontrakt API** (FND-2) uzgadniany między devami przed podpięciem każdego widoku.

## Definition of Done (globalne)
Funkcja działa end-to-end (FE ↔ BE ↔ baza), testy i lint przechodzą.
