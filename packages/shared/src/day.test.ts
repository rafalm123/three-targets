import { describe, expect, it } from 'vitest';
import { morningEntrySchema } from './day';

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
