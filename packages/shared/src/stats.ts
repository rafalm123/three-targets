import { z } from 'zod';

/**
 * Statystyki serii (BE-15/BE-18). Liczone on-the-fly z `days` (bez osobnego pola → brak rozjazdu).
 * BE-18 — dzień liczy się ⇔ ma DOWIEZIONY cel główny (closed + main.completed=true); poboczne bez
 * znaczenia; dzień closed bez dowiezionego głównego naturalnie zrywa serię. Definicja @sa:
 * - `current`  — seria kolejnych dni kalendarzowych z dowiezionym głównym wstecz od „dziś";
 *                dzień w toku (dziś jeszcze bez dowiezionego głównego) NIE zrywa serii (grace tylko dla „dziś"),
 * - `longest`  — najdłuższa taka seria w całej historii,
 * - `totalDays`— łączna liczba dni z dowiezionym głównym (licznik dni),
 * - `asOfDate` — lokalna data „dziś" (serwer, z `users.timezone`), względem której liczono.
 */
export const streakSchema = z.object({
  current: z.number().int().nonnegative(),
  longest: z.number().int().nonnegative(),
  totalDays: z.number().int().nonnegative(),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type Streak = z.infer<typeof streakSchema>;
