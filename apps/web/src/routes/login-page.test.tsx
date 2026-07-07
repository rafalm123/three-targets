import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './login-page';

// Mock klienta Better Auth — testujemy zachowanie formularza, nie sieć.
const signInEmail = vi.fn();
vi.mock('../lib/auth-client', () => ({
  authClient: { signIn: { email: (...args: unknown[]) => signInEmail(...args) as unknown } },
}));

function renderLogin(): void {
  render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('walidacja wejścia: pusty e-mail → komunikat, brak wywołania API', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('Hasło'), 'jakieshaslo');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));
    expect(screen.getByText('E-mail jest wymagany')).toBeTruthy();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it('błąd z API (złe dane) → komunikat PL, przycisk znów aktywny', async () => {
    signInEmail.mockResolvedValue({ error: { code: 'INVALID_EMAIL_OR_PASSWORD' } });
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('E-mail'), 'jan@example.com');
    await user.type(screen.getByLabelText('Hasło'), 'zlehaslo1');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    await waitFor(() => expect(screen.getByText('Niepoprawny e-mail lub hasło.')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Zaloguj się' })).toHaveProperty('disabled', false);
  });

  it('wyjątek sieciowy (rzut) → generyczny komunikat, formularz nie zawisa', async () => {
    signInEmail.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('E-mail'), 'jan@example.com');
    await user.type(screen.getByLabelText('Hasło'), 'jakieshaslo');
    await user.click(screen.getByRole('button', { name: 'Zaloguj się' }));

    await waitFor(() =>
      expect(screen.getByText('Coś poszło nie tak. Spróbuj ponownie.')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Zaloguj się' })).toHaveProperty('disabled', false);
  });
});
