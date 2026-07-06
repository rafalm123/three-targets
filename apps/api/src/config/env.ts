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

let cached: Env | undefined;

/**
 * Zwalidowany, zcache'owany obiekt env. Ładuje .env (dev) przy pierwszym wywołaniu.
 * Rzuca ZodError przy błędnej konfiguracji. Używany przez moduły runtime (np. auth.ts) —
 * daje typy zawężone do `string` zamiast surowego `process.env` (string | undefined).
 */
export function getEnv(): Env {
  if (cached) return cached;
  try {
    process.loadEnvFile();
  } catch {
    // Brak pliku .env — w prod zmienne pochodzą z hosta (Render). To nie jest błąd.
  }
  cached = parseEnv(process.env);
  return cached;
}

/**
 * Wariant dla wejścia aplikacji (index.ts): czytelny komunikat + fail-fast (exit 1).
 * Aplikacja NIE startuje z błędną konfiguracją.
 */
export function loadEnv(): Env {
  try {
    return getEnv();
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error('❌ Błędna konfiguracja środowiska:\n' + z.prettifyError(err));
      process.exit(1);
    }
    throw err;
  }
}
