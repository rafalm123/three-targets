import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

// DATABASE_URL jest wymagane — poprawne przypadki muszą je zawierać.
const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('parseEnv', () => {
  it('stosuje domyślne wartości dla NODE_ENV i PORT', () => {
    const env = parseEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it('koeruje PORT ze stringa na liczbę', () => {
    expect(parseEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('odrzuca niepoprawny PORT', () => {
    expect(() => parseEnv({ ...base, PORT: 'abc' })).toThrow();
  });

  it('odrzuca nieznany NODE_ENV', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'staging' })).toThrow();
  });

  it('wymaga DATABASE_URL', () => {
    expect(() => parseEnv({})).toThrow();
  });

  it('odrzuca niepoprawny DATABASE_URL', () => {
    expect(() => parseEnv({ DATABASE_URL: 'nie-jest-urlem' })).toThrow();
  });

  it('akceptuje poprawny DATABASE_URL', () => {
    const url = 'postgresql://user:pass@localhost:5432/db';
    expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });
});
