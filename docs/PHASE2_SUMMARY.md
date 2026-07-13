# Trzy Cele — Podsumowanie Fazy 2 + ulepszenia streaka

> Rejestr zakresu prac sesji **2026-07-11…13**. Trzy commity na `main`, wdrożone na produkcji
> (https://trzy-cele.onrender.com, Render free + Neon PG18). Dokument żywy — patrz też `CLAUDE.md`
> (§4 model, §8 roadmapa) i `docs/BUSINESS.md` (§4/§5 pivot punktów).

## 1. Co powstało — w jednym zdaniu

Streak przestał mierzyć sam rytuał i mierzy teraz **dowieziony cel główny**; dzisiejszy dzień jest
**edytowalny po zamknięciu**; doszedł **ręczny reset serii**; oraz nowa zakładka **„Lista celów"** —
30-dniowe wyzwanie punktowe z progami nagród, w którym punkty zbiera się za **cele poboczne**.

## 2. Rejestr commitów

| Commit | Zakres |
|---|---|
| `0c39471` | `feat(streak)` — BE-18 (streak z głównego) · BE-19 (edycja dnia po zamknięciu) · BE-20 (ręczny reset) + FE |
| `5292830` | `fix(streak)` — semantyka resetu: `floor=dziś` (odcina przeszłość, dzisiejszy dowieziony główny liczy się) |
| `81e4a56` | `feat(challenges)` — Faza 2 „Lista celów" (30-dniowe wyzwanie punktowe), BE+FE |

## 3. Ulepszenia streaka i doby (BE-18/19/20)

### BE-18 — streak liczy dowieziony cel główny
- Dzień liczy się do serii ⇔ ma cel `kind='main', completed=true`. Cele poboczne bez znaczenia.
- Dzień `closed` bez dowiezionego głównego **nie liczy się** → naturalnie zrywa serię (luka w zbiorze dat).
- Grace dla „dziś": dzień w toku (jeszcze bez dowiezionego głównego) nie zrywa `current`.
- Reguła obejmuje `current/longest/totalDays`; globalna, bez grandfatheringu (przeszłe dni mogą się przeliczyć).
- Zmiana vs Faza 1, gdzie streak mierzył sam rytuał (domknięcie wieczoru). Kod: `stats.ts`/`stats-service.ts` (filtr),
  `streak.ts` (logika ciągów bez zmian).

### BE-19 — dzień „dziś" edytowalny po zamknięciu
- Niemutowalność przedefiniowana z „po statusie (`closed` frozen)" na **„po dacie"**: `date === dziś` ⇒ mutowalne
  (również po `closed`), `date < dziś` ⇒ zamrożone. Maszyna stanów zostaje dwustanowa (`evening_pending → closed`).
- `PATCH /days/today` i re-submit `POST /days/today/evening` działają dla dzisiejszego dnia niezależnie od `closed`.
- Przeszłość zamrożona **strukturalnie** — żaden endpoint mutacji nie przyjmuje daty (operują tylko na „dziś").
- Kod: `day-service.ts` (guard po dacie), `days.ts` (atomowe bramki gate'ują po `{userId,date}`).

### BE-20 — ręczny reset serii
- `POST /api/stats/streak/reset` (`requireAuth`) → zwraca świeży `Streak`.
- Semantyka (`5292830`): ustawia `user.streakResetDate = DZIŚ` (floor). Odcina przeszłą serię, ale bieżący dzień
  nadal się liczy: dziś dowieziony główny → `current=1`; jeszcze nie → `current=0` i podbije się po zamknięciu dnia
  z głównym. Zeruje **tylko** `current`; `longest/totalDays` nietknięte.
- `streakResetDate` = Better Auth `additionalField` (`input:false`, serwerowo). Migracja `20260712150405_add_streak_reset_date`.
- Kod: `stats-service.ts` (`resetStreak`), `streak.ts` (`computeStreak` param `floorDate`).

## 4. Faza 2 — „Lista celów" (30-dniowe wyzwanie punktowe)

### Model punktów (finalny, BEZ KAR)
- Cel **poboczny** wykonany = **+1** (za każdy, max +2/dzień). Cel **główny** = **0** (bez znaczenia dla punktów).
- **Zero odejmowania/ujemnych** — punkty tylko rosną. (Decyzja właściciela: apka ma motywować, nie karać.)
- Nagrodę za cel główny daje **streak** — dwie różne osie: główny → dyscyplina/seria, poboczne → punkty/nagrody.

### Liczenie DERYWACYJNE (bez ledgera)
- `totalPoints` = liczba celów `kind='secondary', completed=true` w dniach usera z `date` w oknie
  `[startDate, min(dziś, endDate)]`. Dzień pominięty / niezamknięty / dziś w toku → 0 wkładu.
- Świadome odejście od pierwotnego `point_events` (§4) — punkty są w pełni funkcją `days`/`goals` (jak streak),
  więc ledger byłby zbędnym stanem do synchronizacji. Ledger wraca w **Fazie 3** (koło ratunkowe/admin/audyt).
- Czysta logika: `apps/api/src/lib/points-service.ts` (testowana bez DB). Orkiestracja DB: `challenge-service.ts`.

### Model danych (migracja `20260713102804_add_challenges`)
- **`challenge`**: `id, userId, title (String?), startDate, endDate (=start+29 dni), createdAt`.
  `startDate/endDate` = `@db.Date` północ UTC (jak `Day.date`) → porównania okna leksykograficzne = kalendarzowe.
  Indeks po `userId`. `startDate = userToday(tz)`. **Jedna aktywna naraz** (`endDate >= dziś`).
- **`reward_tier`**: `id, challengeId (FK onDelete Cascade), threshold (Int), reward (String)`,
  unikat `(challengeId, threshold)`. Progi = wielokrotność 10 w 10..60 (30 dni × max +2 = 60).

### Endpointy (prefiks `/api`, `requireAuth`)
| Endpoint | Co robi | Odpowiedź / błędy |
|---|---|---|
| `POST /challenges` | utwórz 30-dniową listę (title + progi) | 201 `ChallengeWithPoints` · **409 `ACTIVE_CHALLENGE_EXISTS`** · 400 · 401 |
| `GET /challenges/active` | aktywna lista z policzonymi punktami/progami | 200 `{challenge: ChallengeWithPoints\|null}` · 401 |
| `GET /challenges` | historia (zakończone, `endDate < dziś`) | 200 `{items: ChallengeSummary[]}` · 401 |
| `GET /challenges/:id` | szczegóły własnej listy | 200 `{challenge: …\|null}` (cudze → null) · 401 |
| `PATCH /challenges/:id` | edycja tytułu/nagród aktywnej | 200 `ChallengeWithPoints` · **404 `CHALLENGE_NOT_EDITABLE`** · 401 |

- Inwariant „max 1 aktywna" egzekwowany transakcyjnie: `prisma.$transaction` + `pg_advisory_xact_lock(hashtext(userId))`
  wokół check+create (odporne na równoległe POST-y).
- `PATCH` tri-state `title`: pominięty = bez zmian, `null` = wyczyść, string = ustaw.
- Kontrakty: `packages/shared/src/challenge.ts` (`rewardTierSchema`, `rewardTierStateSchema`, `challengeCreateSchema`,
  `challengeUpdateSchema`, `challengeSchema`, `challengeWithPointsSchema`, `challengeResponseSchema`,
  `challengeSummarySchema`, `challengeListSchema`).

### Frontend (`apps/web`)
- Zakładka **`/cele`** (NavLink „Lista celów", pod `ProtectedRoute`).
- `routes/challenge-page.tsx` — HUB: brak aktywnej → formularz tworzenia; jest aktywna → widok postępu
  (`totalPoints`, pasek do następnego progu, progi locked/unlocked, zakres dat + „dni do końca"); pod-sekcja Historia.
- `routes/challenge-create-form.tsx` — tytuł (opcjonalny) + progi `[10,20,30,40,50,60]` z nagrodami; guard double-submit.
- `routes/challenge-tiers.ts` — budowa payloadu (`buildChallengeCreate`, inwariant min 1 próg w jednym miejscu).
- `lib/api.ts` — `createChallenge`/`getActiveChallenge`/`listChallenges`/`getChallenge`/`updateChallenge`.
- Pasek postępu: `windowStart` = najwyższy odblokowany próg (poprawne dla nieciągłych progów), `aria-valuenow`
  klampowany do `[valuemin, valuemax]`.

## 5. Jakość i proces

- **Testy** (wszystkie zielone): `shared` 34 · `api` 59 unit + 66 integracja (na realnym Postgresie) · `web` 125.
- **Review**: @cr na **Fable 5**, dwa niezależne przebiegi (BE i FE) dla obu partii (streak + challenges).
  Znalezione i naprawione MAJOR-y: utrata danych przy re-submicie wieczoru (prefill), a11y dialogu resetu,
  PATCH kasujący tytuł (tri-state), wyścig na „max 1 aktywna" (advisory lock), pasek postępu dla nieciągłych progów.
- **Smoke E2E na żywym API+Postgres** (15/15): auth · dzień · streak · reset · wyzwanie · 409 · historia.
- **Wdrożenie**: push na `main` → Render autoDeploy + `prisma migrate deploy` (obie migracje na Neon prod).
  Nowy kod na prodzie potwierdzony (dyskryminator trasy 404→400/401 + `migrate deploy` przed startem serwera).

## 6. Kluczowe decyzje architektoniczne (@sa)

1. **Streak = dowieziony główny**, nie sam rytuał (zmiana definicji z Fazy 1). Punkty i streak to dwie osie:
   główny napędza serię, poboczne napędzają punkty.
2. **Niemutowalność dnia po dacie**, nie po statusie — dzisiejszy dzień edytowalny do północy, przeszłość zamrożona.
3. **Reset serii: `floor=dziś`** — odcina przeszłość, dzisiejszy dowieziony główny wciąż liczy.
4. **Punkty wyzwania liczone DERYWACYJNIE** z `days`/`goals` (bez ledgera) — okno skończone (30 dni) czyni karę/liczenie
   trywialnym na odczycie, zero stanu do synchronizacji. Ledger `point_events` odłożony do Fazy 3.
5. **Model punktów bez kar** — pozytywne wzmocnienie zamiast strachu (decyzja właściciela).

## 7. Co zostało (nieblokujące)

- **UI edycji aktywnej listy** — endpoint `PATCH /challenges/:id` i klient FE (`updateChallenge`) gotowe,
  brakuje ekranu edycji. Zapisane w `docs/backlog_mvp.md`.
- „Dni do końca" liczone po lokalnym czasie przeglądarki (prezentacja; autorytet okna po stronie serwera).
- Faza 3 (koło ratunkowe + admin) wprowadzi ledger `point_events` pod ręczne korekty/audyt.
