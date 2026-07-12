import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { z } from 'zod';
import { getEnv } from '../config/env';
import { prisma } from './prisma';

// Zwalidowany env (typy zawężone do string) zamiast surowego process.env.
const env = getEnv();

// Poprawny identyfikator strefy IANA? Intl rzuca RangeError dla nieznanej strefy.
function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Konfiguracja Better Auth = źródło prawdy dla schematu auth (Better Auth CLI generuje z niej
 * modele Prisma) ORAZ dla runtime'u (BE-4 podepnie `auth.handler` do Fastify).
 *
 * Pola domenowe dokładane do modelu user:
 *  - role: user|admin (default 'user', input:false — nie ustawiane przy rejestracji; pod plugin admina, Faza 3)
 *  - timezone: IANA, wymagane, input:true — frontend wysyła strefę przeglądarki przy rejestracji (BE-16 granica doby)
 *  - streakResetDate: lokalna data `YYYY-MM-DD` (nullable, input:false — ustawiana WYŁĄCZNIE serwerowo
 *      przez POST /api/stats/streak/reset). BE-20: „podłoga" (floorDate) dla `current` serii — zeruje
 *      tylko bieżącą serię, nie rusza longest/totalDays. String (data-only), bo additionalFields BA
 *      nie ma natywnego typu daty; format spójny z resztą dat lokalnych (day.date jako YYYY-MM-DD).
 * displayName realizujemy wbudowanym polem `name`.
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // Dev: front (Vite) chodzi na :5173 i proxuje /api na :3000 → inny origin niż baseURL,
  // więc musi być zaufany dla ochrony CSRF. W prod jest same-origin (jeden kontener),
  // więc ten origin dodajemy TYLKO poza produkcją.
  trustedOrigins: env.NODE_ENV === 'production' ? [] : ['http://localhost:5173'],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  // Ciasteczko sesji (BE-6): Better Auth domyślnie ustawia HttpOnly + SameSite=Lax (zweryfikowane
  // na żywo). Secure włączamy JAWNIE w produkcji (HTTPS na Render), zamiast polegać na detekcji
  // ze schematu baseURL. UWAGA przy debugowaniu prod: nazwa ciasteczka zyskuje wtedy prefiks
  // `__Secure-` (`__Secure-better-auth.session_token`). Same-origin (jeden kontener) → first-party, bez CORS.
  advanced: {
    useSecureCookies: env.NODE_ENV === 'production',
  },
  user: {
    additionalFields: {
      role: { type: ['user', 'admin'], defaultValue: 'user', input: false },
      timezone: {
        type: 'string',
        required: true,
        input: true,
        // Walidacja IANA na wejściu rejestracji (dług przeniesiony z BE-3).
        validator: {
          input: z
            .string()
            .refine(isValidTimeZone, 'Niepoprawna strefa czasowa IANA (np. Europe/Warsaw)'),
        },
      },
      // BE-20: ustawiana tylko serwerowo (reset serii). input:false → nie do przyjęcia od klienta.
      streakResetDate: { type: 'string', required: false, input: false },
    },
  },
});
