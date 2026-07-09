# Deploy — Render (FND-6)

Jeden kontener Docker (API `/api/*` + statyk SPA `/`, same-origin) na Renderze (free), baza na Neonie.
Konfiguracja: [`render.yaml`](../render.yaml) (Blueprint). Migracje stosują się **na starcie kontenera**
(`apps/api/docker-entrypoint.sh` → `prisma migrate deploy`, idempotentne).

## Kroki właściciela (jednorazowo)

Wymagają konta Render i danych Neona — dlatego robi to właściciel.

1. **Załóż konto** na <https://render.com> (GitHub OAuth) i połącz repo `three-targets`.
2. **New → Blueprint** → wskaż repo. Render wczyta `render.yaml` i utworzy usługę `trzy-cele`
   (Docker, region Frankfurt, plan Free, auto-deploy z `main`).
3. **Uzupełnij sekrety** (4 zmienne `sync:false`) w zakładce *Environment* usługi:
   - `DATABASE_URL` — Neon, connection string przez **pooler** (host z `-pooler`), `?sslmode=require`.
   - `DIRECT_URL` — Neon, połączenie **bezpośrednie** (host **bez** `-pooler`), `?sslmode=require`.
     Używane przez `migrate deploy` (migracje nie powinny iść przez pooler).
   - `BETTER_AUTH_SECRET` — wygeneruj: `openssl rand -base64 32`.
   - `BETTER_AUTH_URL` — publiczny URL usługi. Nazwa usługi jest ustalona w `render.yaml`
     (`trzy-cele`), więc URL jest **przewidywalny**: wpisz od razu `https://trzy-cele.onrender.com`
     (Render nada tę domenę, o ile nazwa wolna). Dzięki temu unikasz cyklu „pierwszy deploy padnie
     na walidacji env → uzupełnij → redeploy". Jeśli Render nada inną domenę — popraw wartość i zrób
     ponowny deploy. (Better Auth używa tego jako `baseURL` + do zaufanych originów.)
   `NODE_ENV=production` jest już w `render.yaml`; `PORT` wstrzykuje Render automatycznie.
4. **Deploy** (Manual Deploy / push na `main`). Pierwszy build ~kilka minut.

## Weryfikacja po deployu (robi zespół — smoke test na prodzie)

```bash
BASE=https://<twoja-usługa>.onrender.com
curl -s $BASE/api/health            # → {"status":"ok"}  (pierwszy request: cold start 30–50 s)
```
Następnie pełny rytuał `curl`-em na sesji: rejestracja → `POST /api/days` → `PATCH /api/days/today`
→ `POST /api/days/today/evening` → `GET /api/days/history` → `GET /api/stats/streak`.
Weryfikujemy to, czego CI nie sprawdza: cold start, Secure/same-origin cookies w prod, `migrate deploy`.

## Uwagi

- **Cold start (free):** kontener usypia po ~15 min → wybudzenie 30–50 s (świadomy trade-off, CLAUDE.md §2).
  Plan B (jeśli uwiera): cron pingujący `/api/health` rano/wieczorem albo VPS Hetzner.
- **Migracje:** idempotentne przy każdym starcie; nowe migracje z `main` zastosują się przy auto-deployu.
- **Backup (FND-7):** wykonać **zaraz po** deployu i **przed** pierwszym realnym wpisem; „done" = udany
  testowy restore z dumpa (nie sam cron).
- **Portowalność:** `render.yaml` to wygoda, nie lock-in — ten sam obraz stanie na VPS/Fly (zmiana hostingu = konfiguracja, nie kod).

## Backup i restore (FND-7)

Workflow [`.github/workflows/backup.yml`](../.github/workflows/backup.yml): `pg_dump` (format custom, `postgres:18`)
codziennie o 02:00 UTC + ręcznie (*Actions → DB Backup → Run workflow*). Dump ląduje jako **artifact**
(retencja 30 dni, zero kosztu). Kolejność wg @sa: **po** deployu, **przed** pierwszym realnym wpisem.

> **Wersja Postgresa:** Neon (prod) to **PG18**, więc dump/restore robimy obrazem `postgres:18`. `pg_dump`
> odmawia zrzutu z serwera o wyższym majorze niż klient — obraz musi być ≥ wersja serwera. (Lokalny
> docker-compose to nadal PG17 dla dev — to osobna baza, nie dotyczy backupu Neona.)

### Krok właściciela (jednorazowo)

Dodaj sekret repo (*Settings → Secrets and variables → Actions → New repository secret*):
- `BACKUP_DATABASE_URL` — **bezpośredni** (unpooled) connection string Neona (host **bez** `-pooler`,
  `?sslmode=require`). Może być ten sam co `DIRECT_URL` z deployu.

Potem odpal workflow ręcznie raz, by potwierdzić, że dump się tworzy.

### „Done" = testowy restore (nie sam cron!)

Pobierz artifact z uruchomienia workflow i odtwórz do **pustej** bazy **PG18** (major ≥ Neon),
weryfikując że dane wracają. Najprościej throwaway kontener `postgres:18`:

```bash
# 1. świeża, pusta baza PG18 (throwaway):
docker run -d --name restore-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:18
sleep 5
# 2. restore dumpa (klient postgres:18) do niej:
docker run --rm -v "$PWD:/dump" postgres:18 \
  pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "postgresql://postgres:test@host.docker.internal:55432/postgres" /dump/backup-<STAMP>.dump
# 3. sprawdź, że tabele wróciły (Better Auth + days/goals):
docker run --rm postgres:18 \
  psql "postgresql://postgres:test@host.docker.internal:55432/postgres" -c '\dt'
docker rm -f restore-test   # sprzątanie
```

Restore uznajemy za zaliczony, gdy tabele i wiersze są na miejscu. Dopiero wtedy FND-7 jest „done".

### Uwagi

- Artifacts wygasają po 30 dniach — dla 1 usera akceptowalne. Jeśli potrzebna trwalsza retencja:
  upload do bucketu (koszt/konto) albo dłuższy `retention-days`. Świadomie MVP.
- `pg_dump` idzie połączeniem bezpośrednim (nie pooler) — spójnie z `migrate deploy`.
- ⚠️ **Cicha śmierć crona:** GitHub **wyłącza harmonogram po 60 dniach bezczynności repo**, a o failu
  crona powiadamia mailem tylko autora ostatniej zmiany w workflow. Dla projektu, który może „leżeć"
  po MVP, to realne ryzyko (cron off → za 30 dni ostatni artifact wygasa → zero backupów). Mitigacja:
  co jakiś czas wejść w *Actions* i sprawdzić/odpalić ręcznie, albo commit ożywiający repo.
