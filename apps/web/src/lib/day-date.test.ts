import { describe, expect, it } from 'vitest';
import { addDaysIso, previousDayIso } from './day-date';

describe('addDaysIso', () => {
  it('cofa o jeden dzień', () => {
    expect(addDaysIso('2026-07-16', -1)).toBe('2026-07-15');
  });

  it('dodaje dni', () => {
    expect(addDaysIso('2026-07-16', 3)).toBe('2026-07-19');
  });

  it('przechodzi granicę miesiąca (cofnięcie)', () => {
    expect(addDaysIso('2026-07-01', -1)).toBe('2026-06-30');
  });

  it('przechodzi granicę roku', () => {
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('rok przestępny 29 lutego', () => {
    expect(addDaysIso('2024-03-01', -1)).toBe('2024-02-29');
  });
});

describe('previousDayIso', () => {
  it('zwraca wczoraj względem kotwicy', () => {
    expect(previousDayIso('2026-07-16')).toBe('2026-07-15');
  });
});
