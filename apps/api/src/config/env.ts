import { z } from 'zod';

/**
 * Kontrakt zmiennych środowiskowych. Walidowany na starcie (fail-fast).
 *
 * DATABASE_URL i sekrety Better Auth są na razie opcjonalne — staną się wymagane
 * przy BE-3 (Prisma) i BE-4 (Better Auth), gdy realnie z nich korzystamy. Dzięki temu
 * walking skeleton startuje bez pełnego .env.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url().optional(),
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.url().optional(),
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
