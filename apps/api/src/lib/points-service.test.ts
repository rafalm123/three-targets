import { describe, expect, it } from 'vitest';
import {
  type ChallengeDayInput,
  computeChallengePoints,
  countPoints,
  resolveTiers,
} from './points-service';

const WINDOW = { startDate: '2026-07-01', endDate: '2026-07-30', today: '2026-07-15' };

/** Skrót: dzień z N pobocznymi `completed=true` (+ opcjonalnie główny completed). */
function day(
  date: string,
  secondaryDone: number,
  mainDone = false,
): ChallengeDayInput {
  const goals: ChallengeDayInput['goals'] = [];
  if (mainDone) goals.push({ kind: 'main', completed: true });
  for (let i = 0; i < 2; i++) {
    goals.push({ kind: 'secondary', completed: i < secondaryDone });
  }
  return { date, goals };
}

describe('countPoints (czysta logika — poboczne +1, główny 0, bez kar)', () => {
  it('brak dni → 0', () => {
    expect(countPoints([], WINDOW)).toBe(0);
  });

  it('poboczne completed sumują +1 (każdy)', () => {
    expect(countPoints([day('2026-07-02', 2)], WINDOW)).toBe(2);
    expect(countPoints([day('2026-07-02', 1)], WINDOW)).toBe(1);
  });

  it('max +2/dzień (dwa poboczne)', () => {
    const days = [day('2026-07-02', 2), day('2026-07-03', 2)];
    expect(countPoints(days, WINDOW)).toBe(4);
  });

  it('główny completed NIE dodaje punktu', () => {
    expect(countPoints([day('2026-07-02', 0, true)], WINDOW)).toBe(0);
    expect(countPoints([day('2026-07-02', 2, true)], WINDOW)).toBe(2); // tylko poboczne
  });

  it('poboczny completed=null (dzień w toku) → 0', () => {
    const inToku: ChallengeDayInput = {
      date: '2026-07-15',
      goals: [
        { kind: 'secondary', completed: null },
        { kind: 'secondary', completed: null },
      ],
    };
    expect(countPoints([inToku], WINDOW)).toBe(0);
  });

  it('poboczny completed=false → 0', () => {
    const d: ChallengeDayInput = {
      date: '2026-07-05',
      goals: [
        { kind: 'secondary', completed: false },
        { kind: 'secondary', completed: false },
      ],
    };
    expect(countPoints([d], WINDOW)).toBe(0);
  });

  it('dzień PRZED oknem nie liczy', () => {
    expect(countPoints([day('2026-06-30', 2)], WINDOW)).toBe(0);
  });

  it('dzień PO oknie (po endDate) nie liczy', () => {
    expect(countPoints([day('2026-07-31', 2)], WINDOW)).toBe(0);
  });

  it('dzień PO „dziś" (przyszłość w oknie) nie liczy — górna granica = min(today, endDate)', () => {
    // today = 07-15, endDate = 07-30; dzień 07-20 jest w oknie kalendarza, ale za „dziś"
    expect(countPoints([day('2026-07-20', 2)], WINDOW)).toBe(0);
  });

  it('granice okna włącznie: startDate i today liczą się', () => {
    const days = [day('2026-07-01', 2), day('2026-07-15', 2)];
    expect(countPoints(days, WINDOW)).toBe(4);
  });

  it('today > endDate → górna granica = endDate (nie dopuszcza dni po końcu)', () => {
    const w = { startDate: '2026-07-01', endDate: '2026-07-10', today: '2026-07-20' };
    const days = [day('2026-07-10', 2), day('2026-07-11', 2)]; // 07-11 po końcu
    expect(countPoints(days, w)).toBe(2);
  });
});

describe('resolveTiers (progi: unlocked / nextThreshold / pointsToNext)', () => {
  it('brak progów → next=null, pointsToNext=null', () => {
    const r = resolveTiers(5, []);
    expect(r.tiers).toEqual([]);
    expect(r.nextThreshold).toBeNull();
    expect(r.pointsToNext).toBeNull();
  });

  it('próg odblokowany DOKŁADNIE przy równości (threshold ≤ total)', () => {
    const r = resolveTiers(10, [{ threshold: 10, reward: 'A' }]);
    expect(r.tiers[0]?.unlocked).toBe(true);
    expect(r.nextThreshold).toBeNull();
    expect(r.pointsToNext).toBeNull();
  });

  it('total poniżej progu → zablokowany, next = ten próg, pointsToNext = różnica', () => {
    const r = resolveTiers(7, [{ threshold: 10, reward: 'A' }]);
    expect(r.tiers[0]?.unlocked).toBe(false);
    expect(r.nextThreshold).toBe(10);
    expect(r.pointsToNext).toBe(3);
  });

  it('wiele progów: część unlocked, nextThreshold = najmniejszy > total', () => {
    const tiers = [
      { threshold: 10, reward: 'A' },
      { threshold: 20, reward: 'B' },
      { threshold: 40, reward: 'C' },
    ];
    const r = resolveTiers(20, tiers);
    expect(r.tiers.map((t) => t.unlocked)).toEqual([true, true, false]);
    expect(r.nextThreshold).toBe(40);
    expect(r.pointsToNext).toBe(20);
  });

  it('wszystkie progi odblokowane → next=null, pointsToNext=null', () => {
    const tiers = [
      { threshold: 10, reward: 'A' },
      { threshold: 20, reward: 'B' },
    ];
    const r = resolveTiers(25, tiers);
    expect(r.tiers.every((t) => t.unlocked)).toBe(true);
    expect(r.nextThreshold).toBeNull();
    expect(r.pointsToNext).toBeNull();
  });

  it('total=0, progi istnieją → nic nie unlocked, next = najmniejszy', () => {
    const tiers = [
      { threshold: 20, reward: 'B' },
      { threshold: 10, reward: 'A' },
    ];
    const r = resolveTiers(0, tiers);
    expect(r.nextThreshold).toBe(10);
    expect(r.pointsToNext).toBe(10);
    // tiers zachowują kolejność wejścia (serwis sortuje przy zapisie)
    expect(r.tiers.every((t) => !t.unlocked)).toBe(true);
  });
});

describe('computeChallengePoints (integracja czystej logiki)', () => {
  it('składa totalPoints + progi w jeden wynik', () => {
    const days = [day('2026-07-02', 2), day('2026-07-03', 1)]; // 3 pkt
    const tiers = [
      { threshold: 10, reward: 'A' },
      { threshold: 20, reward: 'B' },
    ];
    const r = computeChallengePoints(days, WINDOW, tiers);
    expect(r.totalPoints).toBe(3);
    expect(r.nextThreshold).toBe(10);
    expect(r.pointsToNext).toBe(7);
    expect(r.tiers).toEqual([
      { threshold: 10, reward: 'A', unlocked: false },
      { threshold: 20, reward: 'B', unlocked: false },
    ]);
  });
});
