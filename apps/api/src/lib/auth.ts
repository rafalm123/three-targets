import { PrismaClient } from '@prisma/client';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

// Jedyna instancja PrismaClient (konwencja: klient w jednym module, dostęp przez warstwę
// service). Ułatwia to też przyszły upgrade Prisma 6→7 (zmiana importu w jednym miejscu).
const prisma = new PrismaClient();

/**
 * Konfiguracja Better Auth = źródło prawdy dla schematu auth (Better Auth CLI generuje z niej
 * modele Prisma) ORAZ dla runtime'u (BE-4 podepnie `auth.handler` do Fastify).
 *
 * Pola domenowe dokładane do modelu user:
 *  - role: user|admin (default 'user', input:false — nie ustawiane przy rejestracji; pod plugin admina, Faza 3)
 *  - timezone: IANA, wymagane, input:true — frontend wysyła strefę przeglądarki przy rejestracji (BE-16 granica doby)
 * displayName realizujemy wbudowanym polem `name`.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: { type: ['user', 'admin'], defaultValue: 'user', input: false },
      timezone: { type: 'string', required: true, input: true },
    },
  },
});
