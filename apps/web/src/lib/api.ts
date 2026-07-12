import {
  apiErrorSchema,
  dayHistorySchema,
  dayResponseSchema,
  daySchema,
  streakSchema,
  type Day,
  type DayHistory,
  type DayResponse,
  type EveningEntry,
  type MorningEntry,
  type Streak,
} from '@trzy-cele/shared';

/**
 * Minimalny strukturalny kształt schematu zod, którego tu używamy (`safeParse`). Świadomie NIE
 * importujemy `zod` bezpośrednio — nie jest zależnością `apps/web`; kontrakty przychodzą gotowe
 * z `@trzy-cele/shared`, a do walidacji odpowiedzi wystarczy nam `safeParse`.
 */
interface Parseable<T> {
  safeParse: (data: unknown) => { success: true; data: T } | { success: false };
}

/**
 * Klient API dziennika (Plaster 1). Uderza w nasze trasy `/api/*` same-origin (proxy Vite w dev,
 * jeden kontener w prod) — świadomie BEZ `baseURL`, tak jak `authClient`.
 *
 * Kontrakt obsługi błędów (spójny w całej apce):
 *  - awaria sieci (offline, backend down) → natywny `fetch` RZUCA `TypeError`; przepuszczamy dalej,
 *    handler w UI łapie w try/catch i pokazuje generyczny komunikat (jak w formularzach auth),
 *  - odpowiedź HTTP `!ok` → parsujemy kopertę błędu `apiErrorSchema` i rzucamy `ApiRequestError`
 *    z `code`/`message`, by UI mógł zareagować na konkretny kod (np. `DAY_ALREADY_EXISTS`),
 *  - odpowiedź OK, ale kształt niezgodny z kontraktem → rzucamy `ApiRequestError` (kontrakt to
 *    granica zaufania — nie ufamy, że serwer zwrócił oczekiwany kształt, walidujemy `safeParse`).
 */

/** Domyślny komunikat, gdy serwer nie dostarczył sensownego `message`. */
export const GENERIC_API_ERROR = 'Coś poszło nie tak. Spróbuj ponownie.';

/**
 * Błąd pochodzący z odpowiedzi HTTP naszego API (status `!ok` lub niezgodny kształt).
 * `code` = stabilny kod z `apiErrorSchema` (np. `DAY_ALREADY_EXISTS`) — UI mapuje po nim.
 * Awarie sieci NIE są tym typem (leci surowy rzut `fetch`), by odróżnić „serwer odpowiedział
 * błędem" od „nie dało się dobić do serwera".
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/** Nagłówki JSON dla żądań z ciałem. Ciasteczko sesji leci automatycznie (same-origin). */
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Bezpiecznie wyciąga kopertę błędu z odpowiedzi `!ok`; przy braku/niepoprawnym JSON → fallback. */
async function readApiError(response: Response): Promise<ApiRequestError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Odpowiedź błędu bez (poprawnego) JSON — np. 502 z proxy. Zostaje sam status.
    return new ApiRequestError(GENERIC_API_ERROR, response.status);
  }
  const parsed = apiErrorSchema.safeParse(body);
  if (!parsed.success) return new ApiRequestError(GENERIC_API_ERROR, response.status);
  const { message, code } = parsed.data.error;
  return new ApiRequestError(message || GENERIC_API_ERROR, response.status, code);
}

/** Parsuje ciało odpowiedzi OK wg kontraktu; niezgodny kształt = zerwany kontrakt → rzut. */
function parseOk<T>(schema: Parseable<T>, body: unknown, status: number): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiRequestError('Nieoczekiwana odpowiedź serwera.', status);
  }
  return parsed.data;
}

/**
 * GET /api/days/today — dzień „dzisiaj" (serwer liczy go z `users.timezone`, FE nie wysyła daty).
 * Zwraca `{ day: Day | null }`; `day === null` = brak wpisu porannego (steruje UI do „wypełnij rano").
 */
export async function getToday(): Promise<DayResponse> {
  const response = await fetch('/api/days/today', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw await readApiError(response);
  return parseOk(dayResponseSchema, await response.json(), response.status);
}

/**
 * POST /api/days — wpis poranny (tworzy dzień „dziś"). Zwraca *goły* `Day` (201).
 * 409 `DAY_ALREADY_EXISTS` = dzień już istnieje → `ApiRequestError` z tym kodem (UI przeładuje HUB).
 */
export async function createDay(entry: MorningEntry): Promise<Day> {
  const response = await fetch('/api/days', {
    method: 'POST',
    headers: { ...JSON_HEADERS, Accept: 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!response.ok) throw await readApiError(response);
  return parseOk(daySchema, await response.json(), response.status);
}

/**
 * PATCH /api/days/today — edycja porannego wpisu (**pełne zastąpienie**, nie merge). Wysyłamy
 * komplet 1 główny + 2 poboczne + `morningNote`; pominięte opcjonalne pola serwer ustawi na null.
 * Zwraca *goły* `Day` (200). DZISIEJSZY dzień jest edytowalny również po zamknięciu (FE-B) — status
 * `closed` NIE blokuje edycji „dziś". 409 `DAY_ALREADY_CLOSED` to ścieżka martwa-obronna (wyścig/
 * zniknięcie dnia), 404 `NO_DAY_TODAY` = brak dnia → `ApiRequestError` z `code` (UI przeładuje HUB).
 */
export async function updateMorning(entry: MorningEntry): Promise<Day> {
  const response = await fetch('/api/days/today', {
    method: 'PATCH',
    headers: { ...JSON_HEADERS, Accept: 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!response.ok) throw await readApiError(response);
  return parseOk(daySchema, await response.json(), response.status);
}

/**
 * POST /api/days/today/evening — wieczorne odznaczenie (dzień → `closed`). `goals` to DOKŁADNIE
 * 3 obiekty `{id, completed, completedNote?}`, gdzie `id` = id celów z pobranego dnia (nie wymyślać).
 * Zwraca *goły* `Day` (200). Działa też jako RE-SUBMIT dzisiejszego `closed` (FE-B) — status `closed`
 * NIE blokuje ponownego oznaczenia „dziś". 400 `GOAL_MISMATCH` = złe/niepełne id; 409
 * `DAY_ALREADY_CLOSED` to ścieżka martwa-obronna (wyścig); 404 `NO_DAY_TODAY` = brak dnia →
 * `ApiRequestError` z `code` (UI reaguje / przeładuje HUB).
 */
export async function submitEvening(entry: EveningEntry): Promise<Day> {
  const response = await fetch('/api/days/today/evening', {
    method: 'POST',
    headers: { ...JSON_HEADERS, Accept: 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!response.ok) throw await readApiError(response);
  return parseOk(daySchema, await response.json(), response.status);
}

/** GET /api/stats/streak — licznik/seria (current / longest / totalDays / asOfDate). */
export async function getStreak(): Promise<Streak> {
  const response = await fetch('/api/stats/streak', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw await readApiError(response);
  return parseOk(streakSchema, await response.json(), response.status);
}

/**
 * POST /api/stats/streak/reset — zeruje BIEŻĄCĄ serię (`current` → 0); `longest`/`totalDays`
 * zostają nietknięte. Zwraca ten sam kształt co `getStreak` (`streakSchema`). Akcja destrukcyjna
 * i nieodwracalna — UI woła ją WYŁĄCZNIE po potwierdzeniu w dialogu (filozofia właściciela:
 * „apka dla samokontroli, nie apka mnie kontroluje" — reset ma być łatwy, ale świadomy).
 */
export async function resetStreak(): Promise<Streak> {
  const response = await fetch('/api/stats/streak/reset', {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw await readApiError(response);
  return parseOk(streakSchema, await response.json(), response.status);
}

/**
 * GET /api/days/history — historia dni (bez „dziś", bez pełnych notatek). Stronicowanie keyset:
 * `before` = kursor (data z `nextCursor` poprzedniej strony) → starsza strona; brak `before` =
 * najnowsza strona. Zwraca `{ items: DaySummary[], nextCursor }`; `nextCursor === null` = koniec.
 */
export async function getHistory(before?: string, limit?: number): Promise<DayHistory> {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (limit !== undefined) params.set('limit', String(limit));
  const query = params.toString();
  const response = await fetch(`/api/days/history${query ? `?${query}` : ''}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw await readApiError(response);
  return parseOk(dayHistorySchema, await response.json(), response.status);
}

/**
 * GET /api/days/:date — pełny dzień po dacie (`YYYY-MM-DD`, `date ≤ dziś`) do podglądu z historii.
 * Read-only, z notatkami/celami. Zwraca `{ day: Day | null }` (brak wpisu na tę datę → `null`).
 * 400 `FUTURE_DATE`/walidacja → `ApiRequestError` (nie powinno wystąpić — daty bierzemy z historii).
 */
export async function getDayByDate(date: string): Promise<DayResponse> {
  const response = await fetch(`/api/days/${date}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw await readApiError(response);
  return parseOk(dayResponseSchema, await response.json(), response.status);
}
