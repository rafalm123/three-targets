import { describe, expect, it } from 'vitest';
import { eveningEntrySchema, goalMarkPatchSchema, morningEntrySchema } from './day';

const validGoal = { title: 'Cel' };

describe('morningEntrySchema (wpis poranny)', () => {
  it('akceptuje 1 główny + 2 poboczne', () => {
    const r = morningEntrySchema.safeParse({ main: validGoal, secondary: [validGoal, validGoal] });
    expect(r.success).toBe(true);
  });

  it('odrzuca inną liczbę pobocznych niż 2', () => {
    expect(morningEntrySchema.safeParse({ main: validGoal, secondary: [validGoal] }).success).toBe(false);
    expect(
      morningEntrySchema.safeParse({ main: validGoal, secondary: [validGoal, validGoal, validGoal] }).success,
    ).toBe(false);
  });

  it('odrzuca pusty tytuł', () => {
    expect(morningEntrySchema.safeParse({ main: { title: '' }, secondary: [validGoal, validGoal] }).success).toBe(
      false,
    );
  });

  it('przycina białe znaki w tytule/notatce', () => {
    const r = morningEntrySchema.parse({
      main: { title: '  Cel  ', note: '  n  ' },
      secondary: [validGoal, validGoal],
    });
    expect(r.main.title).toBe('Cel');
    expect(r.main.note).toBe('n');
  });
});

describe('eveningEntrySchema (zamknięcie wieczoru — podzbiór oznaczeń 0..3)', () => {
  const mark = { id: 'g1', completed: true };

  it('akceptuje 0 oznaczeń (samo domknięcie z notatką)', () => {
    const r = eveningEntrySchema.safeParse({ goals: [], eveningNote: 'koniec' });
    expect(r.success).toBe(true);
  });

  it('akceptuje podzbiór 1..2 oznaczeń', () => {
    expect(eveningEntrySchema.safeParse({ goals: [mark] }).success).toBe(true);
    expect(
      eveningEntrySchema.safeParse({ goals: [mark, { id: 'g2', completed: false }] }).success,
    ).toBe(true);
  });

  it('akceptuje pełny zestaw 3 oznaczeń', () => {
    const r = eveningEntrySchema.safeParse({
      goals: [mark, { id: 'g2', completed: false }, { id: 'g3', completed: true }],
    });
    expect(r.success).toBe(true);
  });

  it('odrzuca więcej niż 3 oznaczenia', () => {
    const r = eveningEntrySchema.safeParse({
      goals: [mark, mark, mark, mark],
    });
    expect(r.success).toBe(false);
  });
});

describe('goalMarkPatchSchema (oznaczenie per-cel)', () => {
  it('akceptuje completed bez notatki', () => {
    expect(goalMarkPatchSchema.safeParse({ completed: true }).success).toBe(true);
  });

  it('akceptuje completed z przyciętą notatką', () => {
    const r = goalMarkPatchSchema.parse({ completed: false, completedNote: '  ok  ' });
    expect(r.completedNote).toBe('ok');
  });

  it('odrzuca brak completed', () => {
    expect(goalMarkPatchSchema.safeParse({ completedNote: 'x' }).success).toBe(false);
  });
});
