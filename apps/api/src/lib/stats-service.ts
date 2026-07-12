import type { Streak } from '@trzy-cele/shared';
import { addDaysIso, localDateInTimeZone } from './day-boundary';
import { prisma } from './prisma';
import { computeStreak } from './streak';

/**
 * Serwis statystyk serii (BE-15/BE-18/BE-20) — warstwa route → service → Prisma.
 * Trzyma logikę zapytania + reset, żeby trasa (`routes/stats.ts`) była cienka.
 *
 * BE-18: dzień liczy się do serii ⇔ ma cel główny dowieziony (`kind='main', completed=true`).
 * BE-20: `user.streakResetDate` (lokalna data) działa jak `floorDate` — zeruje TYLKO `current`.
 */

/** Daty (`YYYY-MM-DD`) dni użytkownika liczących się do serii = closed z dowiezionym głównym (BE-18). */
async function qualifyingDates(userId: string): Promise<string[]> {
  const rows = await prisma.day.findMany({
    where: { userId, status: 'closed', goals: { some: { kind: 'main', completed: true } } },
    select: { date: true },
  });
  return rows.map((r) => r.date.toISOString().slice(0, 10));
}

/** Bieżąca „podłoga" resetu serii (lokalna data) danego usera, albo `undefined` gdy nigdy nie resetowano. */
async function getStreakResetDate(userId: string): Promise<string | undefined> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { streakResetDate: true },
  });
  return u.streakResetDate ?? undefined;
}

/** Świeży `Streak` względem „dziś" (z timezone usera) i ewentualnego floora (streakResetDate). */
export async function readStreak(userId: string, timeZone: string): Promise<Streak> {
  const asOfDate = localDateInTimeZone(new Date(), timeZone);
  const [dates, floorDate] = await Promise.all([
    qualifyingDates(userId),
    getStreakResetDate(userId),
  ]);
  const { current, longest, totalDays } = computeStreak(dates, asOfDate, floorDate);
  return { current, longest, totalDays, asOfDate };
}

/**
 * BE-20 — ręczny reset serii: ustawia `streakResetDate = JUTRO` (floor dla `current`), po czym
 * zwraca świeży `Streak`. Skutek (decyzja właściciela): `current=0` NATYCHMIAST — nawet gdy dziś
 * dowieziony główny (floor=jutro, pętla `cursor < floor` odcina dziś) — a seria startuje od nowa
 * dopiero od następnego dnia. Zeruje TYLKO `current`; `longest`/`totalDays` nietknięte (pełny zbiór).
 */
export async function resetStreak(userId: string, timeZone: string): Promise<Streak> {
  const tomorrow = addDaysIso(localDateInTimeZone(new Date(), timeZone), 1);
  await prisma.user.update({ where: { id: userId }, data: { streakResetDate: tomorrow } });
  return readStreak(userId, timeZone);
}
