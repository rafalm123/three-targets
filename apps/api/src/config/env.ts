import { z } from 'zod';

/**
 * Kontrakt zmiennych środowiskowych. Walidowany na starcie (fail-fast).
 *
 * DATABASE_URL oraz sekrety Better Auth (BETTER_AUTH_SECRET, BETTER_AUTH_URL) są wymagane
 * od BE-4 (runtime auth). DIRECT_URL (Neon: direct pod migracje) używa WYŁĄCZNIE Prisma CLI
 * przez schema.prisma — runtime aplikacji go nie dotyka, więc świadomie nie ma go tutaj.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Czysta walidacja (bez efektów ubocznych) — testowalna w izolacji.
 * Rzuca ZodError, gdy dane są niepoprawne.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  return envSchema.parse(raw);
}

/**
 * Ładuje .env (dev) i waliduje process.env. Przy błędzie: czytelny komunikat
 * i wyjście z kodem 1 — aplikacja NIE startuje z błędną konfiguracją.
 */
export function loadEnv(): Env {
  try {
    process.loadEnvFile();
  } catch {
    // Brak pliku .env — w prod zmienne pochodzą z hosta (Render). To nie jest błąd.
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Błędna konfiguracja środowiska:\n' + z.prettifyError(result.error));
    process.exit(1);
  }
  return result.data;
}
