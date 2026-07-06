import { MIN_PASSWORD_LENGTH } from '@trzy-cele/shared';

/**
 * Mapowanie błędów Better Auth (FE-2/FE-3) na czytelne komunikaty PL.
 *
 * Metody klienta Better Auth (`signIn`, `signUp`, `signOut`) zwracają `{ data, error }`,
 * gdzie `error` (gdy niepuste) ma kształt `{ message?, code?, status? }`. Kody błędów są
 * stabilnym kontraktem biblioteki — mapujemy te, które użytkownik może wywołać w MVP.
 * Nieznany kod → komunikat fallback (nigdy surowy `undefined` ani techniczny stack).
 */

/** Minimalny kształt błędu zwracanego przez klienta Better Auth. */
export interface AuthClientError {
  message?: string;
  code?: string;
  status?: number;
}

const CODE_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Niepoprawny e-mail lub hasło.',
  USER_ALREADY_EXISTS: 'Konto z tym adresem e-mail już istnieje.',
  EMAIL_CAN_NOT_BE_UPDATED: 'Nie można zmienić tego adresu e-mail.',
  PASSWORD_TOO_SHORT: `Hasło jest za krótkie (min. ${MIN_PASSWORD_LENGTH} znaków).`,
  PASSWORD_TOO_LONG: 'Hasło jest za długie.',
  INVALID_EMAIL: 'Niepoprawny adres e-mail.',
};

const FALLBACK = 'Coś poszło nie tak. Spróbuj ponownie.';

/**
 * Zamienia błąd klienta Better Auth na komunikat dla użytkownika. Preferuje mapowanie po
 * stabilnym `code`; jeśli kodu brak — użyje `message` z serwera; w ostateczności fallback.
 */
export function authErrorMessage(error: AuthClientError | null | undefined): string {
  if (!error) return FALLBACK;
  const mapped = error.code ? CODE_MESSAGES[error.code] : undefined;
  if (mapped) return mapped;
  if (error.message && error.message.trim().length > 0) return error.message;
  return FALLBACK;
}
