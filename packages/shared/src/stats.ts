import { z } from 'zod';

/**
 * Statystyki serii (BE-15). Liczone on-the-fly z `days` (bez osobnego pola → brak rozjazdu).
 * Dzień liczony = `closed`. Definicja @sa:
 * - `current`  — seria kolejnych dni kalendarzowych `closed` wstecz od „dziś"; dzień w toku
 *                (dziś ≠ `closed`) NIE zrywa serii (grace tylko dla „dziś"),
 * - `longest`  — najdłuższa taka seria w całej historii,
 * - `totalDays`— łączna liczba dni `closed` (licznik dni),
 * - `asOfDate` — lokalna data „dziś" (serwer, z `users.timezone`), względem której liczono.
 */
export const streakSchema = z.object({
  current: z.number().int().nonnegative(),
  longest: z.number().int().nonnegative(),
  totalDays: z.number().int().nonnegative(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type Streak = z.infer<typeof streakSchema>;
