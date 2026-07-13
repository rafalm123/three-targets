import type {
  Challenge,
  ChallengeCreate,
  ChallengeSummary,
  ChallengeUpdate,
  ChallengeWithPoints,
  RewardTier,
} from '@trzy-cele/shared';
import type { Prisma } from '@prisma/client';
import { addDaysIso, dateOnlyUtc, userToday } from './day-boundary';
import { type ChallengeDayInput, computeChallengePoints } from './points-service';
import { prisma } from './prisma';

/**
 * Serwis wyzwań punktowych (BE-P3) — warstwa route → service → Prisma. Trasy cienkie.
 *
 * Punkty DERYWACYJNE (decyzja @sa): liczone on-the-fly z `days`/`goals` w oknie wyzwania
 * [startDate, min(dziś, endDate)] przez `points-service` (czysta logika). Bez ledgera do Fazy 3.
 *
 * Daty wyzwania (`startDate`/`endDate`) trzymane jak `Day.date`: `@db.Date`, północ UTC
 * (`dateOnlyUtc`), odczyt `.toISOString().slice(0,10)` → porównania okna leksykograficzne = kalendarzowe.
 *
 * „Aktywna" = `endDate >= dziś`; „historia" = `endDate < dziś`. Okno = 30 dni (start + 29).
 * „Dziś" (`todayDate`/`todayIso`) liczone RAZ na wejściu każdej operacji (jeden `userToday`) —
 * unika rozjazdu na granicy północy (CR #6).
 */

const CHALLENGE_LENGTH_DAYS = 30; // wyzwanie 30-dniowe → endDate = startDate + 29

type ChallengeWithTiers = Prisma.ChallengeGetPayload<{ include: { rewardTiers: true } }>;
type TxClient = Prisma.TransactionClient;

/** Sygnał: user ma już aktywne wyzwanie → mapowane na 409 w trasie. */
export class ActiveChallengeExistsError extends Error {}

/** Sygnał: brak aktywnego wyzwania o tym id do edycji → mapowane na 404 w trasie. */
export class ChallengeNotEditableError extends Error {}

/** `Date` (@db.Date, północ UTC) → `YYYY-MM-DD`. */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** „Dziś" usera policzone raz: `Date` (północ UTC) + `YYYY-MM-DD` — spójne w obrębie jednej operacji. */
function resolveToday(timeZone: string): { todayDate: Date; todayIso: string } {
  const todayDate = userToday(timeZone);
  return { todayDate, todayIso: toIsoDate(todayDate) };
}

/** Progi posortowane rosnąco (kontrakt gwarantuje ściśle rosnące, ale porządkujemy defensywnie). */
function sortedTiers(tiers: readonly RewardTier[]): RewardTier[] {
  return [...tiers].sort((a, b) => a.threshold - b.threshold);
}

/**
 * Dni usera z POBOCZNYMI celami w oknie [startIso, upperIso] → wejście dla `points-service`.
 * CR #9: ładujemy tylko `kind='secondary'` (jedyne liczące się do punktów) — mniej danych.
 */
async function loadWindowDays(
  userId: string,
  startIso: string,
  upperIso: string,
): Promise<ChallengeDayInput[]> {
  const rows = await prisma.day.findMany({
    where: {
      userId,
      date: { gte: dateOnlyUtc(startIso), lte: dateOnlyUtc(upperIso) },
    },
    select: {
      date: true,
      goals: { where: { kind: 'secondary' }, select: { kind: true, completed: true } },
    },
  });
  return rows.map((r) => ({
    date: toIsoDate(r.date),
    goals: r.goals.map((g) => ({ kind: g.kind, completed: g.completed })),
  }));
}

/** Górna granica okna = min(dziś, endDate) jako `YYYY-MM-DD`. */
function windowUpperBound(todayIso: string, endIso: string): string {
  return todayIso < endIso ? todayIso : endIso;
}

/**
 * CR #3: tanie policzenie `totalPoints` bez ładowania dni z celami (dla historii — N wyzwań).
 * Zlicza poboczne `completed=true` w dniach usera z `date` w oknie [startIso, upperIso].
 * Pusty zakres (upper < start) → 0 bez zapytania.
 */
async function countWindowPoints(
  userId: string,
  startIso: string,
  upperIso: string,
): Promise<number> {
  if (upperIso < startIso) return 0;
  return prisma.goal.count({
    where: {
      kind: 'secondary',
      completed: true,
      day: { userId, date: { gte: dateOnlyUtc(startIso), lte: dateOnlyUtc(upperIso) } },
    },
  });
}

/** Buduje `ChallengeWithPoints` z rekordu wyzwania (z progami) i „dziś" (lokalna data). */
async function toChallengeWithPoints(
  ch: ChallengeWithTiers,
  todayIso: string,
): Promise<ChallengeWithPoints> {
  const startIso = toIsoDate(ch.startDate);
  const endIso = toIsoDate(ch.endDate);
  const upperIso = windowUpperBound(todayIso, endIso);

  // Górna granica < startDate ⇒ okno jeszcze się nie zaczęło → 0 dni (unikamy pustego zakresu w DB).
  const days = upperIso < startIso ? [] : await loadWindowDays(ch.userId, startIso, upperIso);

  const tiers = sortedTiers(ch.rewardTiers.map((t) => ({ threshold: t.threshold, reward: t.reward })));
  const points = computeChallengePoints(days, { startDate: startIso, endDate: endIso, today: todayIso }, tiers);

  return {
    id: ch.id,
    title: ch.title,
    startDate: startIso,
    endDate: endIso,
    createdAt: ch.createdAt.toISOString(),
    totalPoints: points.totalPoints,
    nextThreshold: points.nextThreshold,
    pointsToNext: points.pointsToNext,
    tiers: points.tiers,
  };
}

/** Bazowa reprezentacja bez punktów (na wypadek potrzeby; obecnie API zwraca WithPoints). */
export function toChallenge(ch: ChallengeWithTiers): Challenge {
  return {
    id: ch.id,
    title: ch.title,
    startDate: toIsoDate(ch.startDate),
    endDate: toIsoDate(ch.endDate),
    createdAt: ch.createdAt.toISOString(),
  };
}

/** Aktywne wyzwanie usera (endDate >= dziś) z progami, albo null. Opcjonalnie w transakcji. */
async function findActive(
  client: Pick<typeof prisma, 'challenge'> | TxClient,
  userId: string,
  todayDate: Date,
): Promise<ChallengeWithTiers | null> {
  return client.challenge.findFirst({
    where: { userId, endDate: { gte: todayDate } },
    include: { rewardTiers: true },
    orderBy: { startDate: 'desc' },
  });
}

/**
 * BE-P3: tworzy wyzwanie „dziś" (start = userToday, end = start+29). 409 gdy istnieje AKTYWNE.
 *
 * CR #2: check + create atomowo w transakcji z **advisory lock per-user**
 * (`pg_advisory_xact_lock(hashtext(userId))`) — serializuje równoległe POST-y tego samego usera,
 * egzekwując inwariant „max 1 aktywna" na zawsze (bez DELETE nie da się posprzątać duplikatu ręcznie).
 * Lock zwalnia się z końcem transakcji; tani przy 1 userze.
 */
export async function createChallenge(
  userId: string,
  timeZone: string,
  input: ChallengeCreate,
): Promise<ChallengeWithPoints> {
  const { todayIso } = resolveToday(timeZone);
  const startIso = todayIso;
  const endIso = addDaysIso(startIso, CHALLENGE_LENGTH_DAYS - 1);
  const todayDate = dateOnlyUtc(todayIso);
  const tiers = sortedTiers(input.tiers);

  const created = await prisma.$transaction(async (tx) => {
    // Advisory lock per-user: równoległe POST-y tego samego usera serializują się tutaj.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const existingActive = await findActive(tx, userId, todayDate);
    if (existingActive) throw new ActiveChallengeExistsError('Masz już aktywne wyzwanie');

    return tx.challenge.create({
      data: {
        userId,
        title: input.title ?? null,
        startDate: dateOnlyUtc(startIso),
        endDate: dateOnlyUtc(endIso),
        rewardTiers: { create: tiers.map((t) => ({ threshold: t.threshold, reward: t.reward })) },
      },
      include: { rewardTiers: true },
    });
  });

  return toChallengeWithPoints(created, todayIso);
}

/** BE-P3: aktywne wyzwanie usera z policzonymi punktami, albo null. */
export async function getActiveChallenge(
  userId: string,
  timeZone: string,
): Promise<ChallengeWithPoints | null> {
  const { todayDate, todayIso } = resolveToday(timeZone);
  const active = await findActive(prisma, userId, todayDate);
  return active ? toChallengeWithPoints(active, todayIso) : null;
}

/**
 * BE-P3: historia — zakończone wyzwania (endDate < dziś), od najnowszych, z sumą punktów.
 * CR #3: punkty summary liczone tanio przez `countWindowPoints` (agregacja w DB), bez ładowania
 * dni z celami per wyzwanie (unika N+1 rekomputacji na już niezmiennej historii).
 */
export async function listChallenges(
  userId: string,
  timeZone: string,
): Promise<ChallengeSummary[]> {
  const { todayDate, todayIso } = resolveToday(timeZone);
  const rows = await prisma.challenge.findMany({
    where: { userId, endDate: { lt: todayDate } },
    select: { id: true, title: true, startDate: true, endDate: true },
    orderBy: { startDate: 'desc' },
  });

  return Promise.all(
    rows.map(async (ch): Promise<ChallengeSummary> => {
      const startIso = toIsoDate(ch.startDate);
      const endIso = toIsoDate(ch.endDate);
      const upperIso = windowUpperBound(todayIso, endIso); // zakończone → = endIso, ale spójnie
      const totalPoints = await countWindowPoints(userId, startIso, upperIso);
      return { id: ch.id, title: ch.title, startDate: startIso, endDate: endIso, totalPoints };
    }),
  );
}

/** BE-P3: wyzwanie po id (tylko własne) z punktami, albo null. */
export async function getChallengeById(
  userId: string,
  timeZone: string,
  id: string,
): Promise<ChallengeWithPoints | null> {
  const { todayIso } = resolveToday(timeZone);
  const ch = await prisma.challenge.findFirst({
    where: { id, userId },
    include: { rewardTiers: true },
  });
  return ch ? toChallengeWithPoints(ch, todayIso) : null;
}

/**
 * BE-P3: edycja nagród/tytułu — TYLKO dla AKTYWNEJ własnej listy (endDate >= dziś).
 * `tiers` = pełne zastąpienie progów (usuwa stare, tworzy nowe).
 *
 * CR #1 — TRI-STATE tytułu (PATCH, nie PUT): `title` pominięty (undefined) → BEZ ZMIAN;
 * `title = null` → wyczyść; `title = string` → ustaw. Brak własnego aktywnego wyzwania → 404.
 */
export async function updateChallenge(
  userId: string,
  timeZone: string,
  id: string,
  input: ChallengeUpdate,
): Promise<ChallengeWithPoints> {
  const { todayDate, todayIso } = resolveToday(timeZone);
  const tiers = sortedTiers(input.tiers);

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.challenge.findFirst({
      where: { id, userId, endDate: { gte: todayDate } },
      select: { id: true },
    });
    if (!existing) throw new ChallengeNotEditableError('Brak aktywnego wyzwania do edycji');

    await tx.rewardTier.deleteMany({ where: { challengeId: id } });
    await tx.challenge.update({
      where: { id },
      data: {
        // Tri-state: klucz `title` w update-data TYLKO gdy podany (undefined → pomiń → bez zmian).
        ...(input.title !== undefined ? { title: input.title } : {}),
        rewardTiers: { create: tiers.map((t) => ({ threshold: t.threshold, reward: t.reward })) },
      },
    });
    return tx.challenge.findUniqueOrThrow({ where: { id }, include: { rewardTiers: true } });
  });

  return toChallengeWithPoints(updated, todayIso);
}
