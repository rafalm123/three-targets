import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './auth-errors';

describe('authErrorMessage', () => {
  it('mapuje znany kod na komunikat PL', () => {
    expect(authErrorMessage({ code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe(
      'Niepoprawny e-mail lub hasło.',
    );
    expect(authErrorMessage({ code: 'USER_ALREADY_EXISTS' })).toBe(
      'Konto z tym adresem e-mail już istnieje.',
    );
  });

  it('dla nieznanego kodu z message używa message serwera', () => {
    expect(authErrorMessage({ code: 'SOMETHING_NEW', message: 'Coś konkretnego' })).toBe(
      'Coś konkretnego',
    );
  });

  it('fallback dla braku danych / pustego błędu', () => {
    expect(authErrorMessage(null)).toBe('Coś poszło nie tak. Spróbuj ponownie.');
    expect(authErrorMessage(undefined)).toBe('Coś poszło nie tak. Spróbuj ponownie.');
    expect(authErrorMessage({})).toBe('Coś poszło nie tak. Spróbuj ponownie.');
    expect(authErrorMessage({ message: '   ' })).toBe('Coś poszło nie tak. Spróbuj ponownie.');
  });
});
