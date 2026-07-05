import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('stosuje domyślne wartości, gdy brak zmiennych', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('koeruje PORT ze stringa na liczbę', () => {
    expect(parseEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('odrzuca niepoprawny PORT', () => {
    expect(() => parseEnv({ PORT: 'abc' })).toThrow();
  });

  it('odrzuca nieznany NODE_ENV', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow();
  });

  it('odrzuca niepoprawny DATABASE_URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'nie-jest-urlem' })).toThrow();
  });

  it('akceptuje poprawny DATABASE_URL', () => {
    const url = 'postgresql://user:pass@localhost:5432/db';
    expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });
});
