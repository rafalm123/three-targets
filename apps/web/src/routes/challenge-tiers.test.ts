import { describe, expect, it } from 'vitest';
import {
  TIER_THRESHOLDS,
  buildChallengeCreate,
  buildTiers,
  emptyTierDraft,
} from './challenge-tiers';

describe('challenge-tiers', () => {
  it('TIER_THRESHOLDS = stałe rzędy 10..60 (rosnące, wielokrotności 10, ≤60)', () => {
    expect(TIER_THRESHOLDS).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('emptyTierDraft: wszystkie progi puste', () => {
    const draft = emptyTierDraft();
    expect(Object.keys(draft).map(Number)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(Object.values(draft).every((v) => v === '')).toBe(true);
  });

  it('buildTiers: pomija puste i whitespace, trimuje, zwraca rosnąco', () => {
    const draft = { ...emptyTierDraft(), 10: '  Kino  ', 30: 'Książka', 20: '   ' };
    expect(buildTiers(draft)).toEqual([
      { threshold: 10, reward: 'Kino' },
      { threshold: 30, reward: 'Książka' },
    ]);
  });

  it('buildChallengeCreate: pomija pusty tytuł, składa tiers', () => {
    const draft = { ...emptyTierDraft(), 10: 'Kino' };
    expect(buildChallengeCreate('   ', draft)).toEqual({ tiers: [{ threshold: 10, reward: 'Kino' }] });
    expect(buildChallengeCreate('Lipiec', draft)).toEqual({
      title: 'Lipiec',
      tiers: [{ threshold: 10, reward: 'Kino' }],
    });
  });

  it('buildChallengeCreate: brak żadnej nagrody → null (inwariant „min 1 próg")', () => {
    expect(buildChallengeCreate('Lipiec', emptyTierDraft())).toBeNull();
    // Same białe znaki też nie liczą się jako nagroda.
    expect(buildChallengeCreate('', { ...emptyTierDraft(), 10: '   ' })).toBeNull();
  });
});
