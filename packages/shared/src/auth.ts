import { z } from 'zod';

/**
 * Kontrakt auth — SSOT dla pól domenowych użytkownika i kształtu formularzy (FE-2/FE-3).
 *
 * Decyzja architektoniczna (@sa, 2026-07-06): pola domenowe `role`/`timezone` oraz walidacja
 * wejścia rejestracji/logowania definiujemy TU (w kontrakcie), nie inferujemy z `typeof auth`
 * z apps/api. Dzięki temu FE nie zależy (nawet type-only) od backendu, a separacja FE/BE
 * pozostaje czysta. Backend wyprowadza swoje `additionalFields` z tych samych pojęć;
 * rozjazd łapie test kontraktowy po stronie api (dług BE).
 */

/** Rola użytkownika. Domenowe pojęcie — potrzebne przy guardach i kontraktach endpointów. */
export const userRoleSchema = z.enum(['user', 'admin']);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * Poprawny identyfikator strefy IANA? `Intl` rzuca `RangeError` dla nieznanej strefy.
 * Ten sam predykat, którym backend waliduje `timezone` na wejściu rejestracji.
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Strefa czasowa przeglądarki (IANA). Rejestracja MUSI ją wysłać — backend wymaga `timezone`
 * i na jego podstawie wyznacza granicę doby (BE-16). Zwraca `null`, gdy środowisko nie potrafi
 * podać poprawnej strefy (bardzo rzadkie) — FE traktuje to jako błąd walidacji, nie zgaduje.
 */
export function resolveBrowserTimeZone(): string | null {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return timeZone && isValidTimeZone(timeZone) ? timeZone : null;
}

/** Kontrakt pola `timezone`: niepusty, poprawny IANA. Współdzielony przez formularz i backend. */
export const timeZoneSchema = z
  .string()
  .min(1, 'Strefa czasowa jest wymagana')
  .refine(isValidTimeZone, 'Niepoprawna strefa czasowa IANA (np. Europe/Warsaw)');

/** E-mail — normalizowany do lowercase + trim (spójnie z tym, jak logują się użytkownicy). */
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'E-mail jest wymagany')
  .email('Niepoprawny adres e-mail')
  .toLowerCase();

/**
 * Hasło. Minimum 8 znaków (domyślny wymóg Better Auth to 8). Nie duplikujemy tu polityki
 * backendu ponad to — walidacja wejściowa ma dać czytelny komunikat, autorytetem pozostaje BE.
 */
export const passwordSchema = z.string().min(8, 'Hasło musi mieć min. 8 znaków');

/** Wyświetlana nazwa (`name` w Better Auth = displayName). */
export const displayNameSchema = z.string().trim().min(1, 'Nazwa jest wymagana');

/** Kontrakt formularza logowania. */
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Hasło jest wymagane'),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

/** Kontrakt formularza rejestracji. `timezone` WYMAGANE (pole wymagane przez backend). */
export const registerInputSchema = z.object({
  name: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
  timezone: timeZoneSchema,
});
export type RegisterInput = z.infer<typeof registerInputSchema>;
