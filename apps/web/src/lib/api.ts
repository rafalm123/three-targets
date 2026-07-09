import {
  apiErrorSchema,
  dayResponseSchema,
  daySchema,
  streakSchema,
  type Day,
  type DayResponse,
  type MorningEntry,
  type Streak,
} from '@trzy-cele/shared';

/**
 * Minimalny strukturalny kształt schematu zod, którego tu używamy (`safeParse`). Świadomie NIE
 * importujemy `zod` bezpośrednio — nie jest zależnością `apps/web`; kontrakty przychodzą gotowe
 * z `@trzy-cele/shared`, a do walidacji odpowiedzi wystarczy nam `safeParse`.
 */
interface Parseable<T> {
  safeParse: (data: unknown) =>
    | { success: true; data: T }
    | { success: false };
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

/** GET /api/stats/streak — licznik/seria (current / longest / totalDays / asOfDate). */
export async function getStreak(): Promise<Streak> {
  const response = await fetch('/api/stats/streak', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw await readApiError(response);
  return parseOk(streakSchema, await response.json(), response.status);
}
