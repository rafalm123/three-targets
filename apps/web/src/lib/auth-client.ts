import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Klient Better Auth dla React (FE-2).
 *
 * Same-origin: SPA i API są pod tym samym originem (jeden kontener w prod; w dev Vite proxuje
 * `/api` → backend). Dlatego `baseURL` jest ścieżką WZGLĘDNĄ `/api/auth` — żadnych absolutnych
 * URL-i, zero CORS, ciasteczko sesji jest first-party (HttpOnly, SameSite=Lax).
 *
 * `inferAdditionalFields` — wariant JAWNY (decyzja @sa, 2026-07-06): deklarujemy kształt pól
 * domenowych po stronie klienta zamiast inferować `typeof auth` z apps/api. FE nie zależy od
 * backendu; kontrakt pól żyje w `@trzy-cele/shared`, tu tylko odwzorowujemy go na metadane
 * Better Auth (te wartości muszą być zgodne z `additionalFields` w apps/api).
 */
export const authClient = createAuthClient({
  baseURL: '/api/auth',
  plugins: [
    inferAdditionalFields({
      user: {
        // Rola: nieustawiana przez klienta (input:false) — pod plugin admina (Faza 3).
        role: { type: ['user', 'admin'], input: false },
        // Strefa IANA: wymagana, wysyłana przez formularz rejestracji (BE-16 granica doby).
        timezone: { type: 'string', required: true, input: true },
      },
    }),
  ],
});

/** Reaktywny hook sesji — źródło prawdy o zalogowaniu w całej apce (FE-4). */
export const useSession = authClient.useSession;

/** Typ zalogowanego użytkownika (z polami domenowymi `role`/`timezone`). */
export type SessionUser = NonNullable<
  ReturnType<typeof authClient.useSession>['data']
>['user'];
