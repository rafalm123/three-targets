import { describe, expect, it } from 'vitest';
import {
  challengeCreateSchema,
  challengeUpdateSchema,
  rewardTierSchema,
} from './challenge';

describe('rewardTierSchema (próg: int, %10, 10..60)', () => {
  it('akceptuje poprawny próg', () => {
    expect(rewardTierSchema.safeParse({ threshold: 10, reward: 'Kino' }).success).toBe(true);
    expect(rewardTierSchema.safeParse({ threshold: 60, reward: 'X' }).success).toBe(true);
  });

  it('odrzuca próg spoza 10..60', () => {
    expect(rewardTierSchema.safeParse({ threshold: 0, reward: 'X' }).success).toBe(false);
    expect(rewardTierSchema.safeParse({ threshold: 70, reward: 'X' }).success).toBe(false);
  });

  it('odrzuca próg niebędący wielokrotnością 10', () => {
    expect(rewardTierSchema.safeParse({ threshold: 15, reward: 'X' }).success).toBe(false);
  });

  it('odrzuca pustą lub za długą nagrodę', () => {
    expect(rewardTierSchema.safeParse({ threshold: 10, reward: '' }).success).toBe(false);
    expect(rewardTierSchema.safeParse({ threshold: 10, reward: 'x'.repeat(201) }).success).toBe(false);
  });

  it('przycina białe znaki w nagrodzie', () => {
    const r = rewardTierSchema.parse({ threshold: 10, reward: '  Kino  ' });
    expect(r.reward).toBe('Kino');
  });
});

describe('challengeCreateSchema', () => {
  const t = (threshold: number, reward = 'r') => ({ threshold, reward });

  it('akceptuje 1 próg', () => {
    expect(challengeCreateSchema.safeParse({ tiers: [t(10)] }).success).toBe(true);
  });

  it('akceptuje tytuł opcjonalny i progi ściśle rosnące', () => {
    const r = challengeCreateSchema.safeParse({
      title: 'Lipiec',
      tiers: [t(10), t(20), t(40)],
    });
    expect(r.success).toBe(true);
  });

  it('odrzuca pustą listę progów', () => {
    expect(challengeCreateSchema.safeParse({ tiers: [] }).success).toBe(false);
  });

  it('odrzuca progi nie-rosnące (duplikat)', () => {
    expect(challengeCreateSchema.safeParse({ tiers: [t(10), t(10)] }).success).toBe(false);
  });

  it('odrzuca progi malejące / nieuporządkowane', () => {
    expect(challengeCreateSchema.safeParse({ tiers: [t(20), t(10)] }).success).toBe(false);
  });

  it('odrzuca próg > 60 (spójne z rewardTierSchema)', () => {
    expect(challengeCreateSchema.safeParse({ tiers: [t(70)] }).success).toBe(false);
  });

  it('odrzuca za długi tytuł', () => {
    expect(challengeCreateSchema.safeParse({ title: 'x'.repeat(201), tiers: [t(10)] }).success).toBe(false);
  });

  it('odrzuca pusty tytuł "" (MINOR 4 — min 1)', () => {
    expect(challengeCreateSchema.safeParse({ title: '', tiers: [t(10)] }).success).toBe(false);
    // spacje przycięte do pustego też odrzucone
    expect(challengeCreateSchema.safeParse({ title: '   ', tiers: [t(10)] }).success).toBe(false);
  });
});

describe('challengeUpdateSchema (tri-state title: pominięty=bez zmian, null=wyczyść)', () => {
  const t = (threshold: number, reward = 'r') => ({ threshold, reward });

  it('wymaga tiers (pełne zastąpienie)', () => {
    expect(challengeUpdateSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(challengeUpdateSchema.safeParse({ tiers: [t(10)] }).success).toBe(true);
  });

  it('egzekwuje rosnące progi', () => {
    expect(challengeUpdateSchema.safeParse({ tiers: [t(20), t(10)] }).success).toBe(false);
  });

  // MAJOR 1 — tri-state title.
  it('title POMINIĘTY jest OK (bez zmian tytułu)', () => {
    const r = challengeUpdateSchema.safeParse({ tiers: [t(10)] });
    expect(r.success).toBe(true);
    if (r.success) expect('title' in r.data).toBe(false); // undefined nie materializuje klucza
  });

  it('title = null jest OK (wyczyść tytuł)', () => {
    const r = challengeUpdateSchema.safeParse({ title: null, tiers: [t(10)] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBeNull();
  });

  it('title = string przycięty jest OK', () => {
    const r = challengeUpdateSchema.safeParse({ title: '  Nowy  ', tiers: [t(10)] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.title).toBe('Nowy');
  });

  it('title = "" (pusty) odrzucony — null jest jawnym „wyczyść", nie pusty string', () => {
    expect(challengeUpdateSchema.safeParse({ title: '', tiers: [t(10)] }).success).toBe(false);
  });
});
