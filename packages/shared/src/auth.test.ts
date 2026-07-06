import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  isValidTimeZone,
  loginInputSchema,
  registerInputSchema,
  resolveBrowserTimeZone,
  timeZoneSchema,
  userRoleSchema,
} from './auth';

describe('isValidTimeZone', () => {
  it('akceptuje poprawną strefę IANA', () => {
    expect(isValidTimeZone('Europe/Warsaw')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('odrzuca nieznaną strefę', () => {
    expect(isValidTimeZone('Nieistniejaca/Strefa')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('resolveBrowserTimeZone', () => {
  it('zwraca poprawną strefę (środowisko testowe ma jakąś strefę)', () => {
    const tz = resolveBrowserTimeZone();
    // W środowisku CI/lokalnym Intl zawsze zna strefę → oczekujemy stringa, nie null.
    expect(tz).not.toBeNull();
    if (tz) expect(isValidTimeZone(tz)).toBe(true);
  });
});

describe('emailSchema', () => {
  it('normalizuje do lowercase i trimuje', () => {
    expect(emailSchema.parse('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });

  it('odrzuca niepoprawny e-mail', () => {
    expect(emailSchema.safeParse('nie-email').success).toBe(false);
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('timeZoneSchema', () => {
  it('przepuszcza IANA, odrzuca śmieci', () => {
    expect(timeZoneSchema.safeParse('Europe/Warsaw').success).toBe(true);
    expect(timeZoneSchema.safeParse('xxx').success).toBe(false);
    expect(timeZoneSchema.safeParse('').success).toBe(false);
  });
});

describe('userRoleSchema', () => {
  it('zna dokładnie role user/admin', () => {
    expect(userRoleSchema.options).toEqual(['user', 'admin']);
  });
});

describe('loginInputSchema', () => {
  it('wymaga e-maila i niepustego hasła', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('registerInputSchema', () => {
  const base = {
    name: 'Jan',
    email: 'jan@example.com',
    password: 'haslo123',
    timezone: 'Europe/Warsaw',
  };

  it('przepuszcza komplet poprawnych pól', () => {
    expect(registerInputSchema.safeParse(base).success).toBe(true);
  });

  it('wymaga timezone (pole wymagane przez backend)', () => {
    const { timezone: _omit, ...withoutTz } = base;
    expect(registerInputSchema.safeParse(withoutTz).success).toBe(false);
  });

  it('odrzuca za krótkie hasło i niepoprawną strefę', () => {
    expect(registerInputSchema.safeParse({ ...base, password: 'krotkie' }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...base, timezone: 'xxx' }).success).toBe(false);
  });
});
