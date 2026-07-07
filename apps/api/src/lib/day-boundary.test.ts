import { describe, expect, it } from 'vitest';
import { dateOnlyUtc, localDateInTimeZone, userToday } from './day-boundary';

// Granica doby to najłatwiejsze miejsce na bugi (strefy, DST, UTC) — testujemy dokładnie.
describe('localDateInTimeZone', () => {
  it('Europe/Warsaw (lato, UTC+2): 23:30Z → następny dzień lokalnie', () => {
    expect(localDateInTimeZone(new Date('2026-07-07T23:30:00Z'), 'Europe/Warsaw')).toBe('2026-07-08');
  });

  it('ta sama chwila, różne strefy → różne daty', () => {
    const instant = new Date('2026-07-07T23:30:00Z');
    expect(localDateInTimeZone(instant, 'America/New_York')).toBe('2026-07-07'); // UTC-4 → 19:30
    expect(localDateInTimeZone(instant, 'Pacific/Kiritimati')).toBe('2026-07-08'); // UTC+14 → 13:30 (+1d)
  });

  it('Europe/Warsaw (zima, UTC+1): granica północy', () => {
    expect(localDateInTimeZone(new Date('2026-01-15T23:00:00Z'), 'Europe/Warsaw')).toBe('2026-01-16');
  });
});

describe('dateOnlyUtc', () => {
  it('YYYY-MM-DD → północ UTC (bez przesunięcia dnia)', () => {
    expect(dateOnlyUtc('2026-07-08').toISOString()).toBe('2026-07-08T00:00:00.000Z');
  });
});

describe('userToday', () => {
  it('składa lokalne „dziś" jako północ UTC (gotowe do @db.Date)', () => {
    const now = new Date('2026-07-07T23:30:00Z');
    expect(userToday('Europe/Warsaw', now).toISOString()).toBe('2026-07-08T00:00:00.000Z');
  });
});
