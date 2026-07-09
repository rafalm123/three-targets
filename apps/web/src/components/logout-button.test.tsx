import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogoutButton } from './logout-button';

const signOut = vi.fn();
vi.mock('../lib/auth-client', () => ({
  authClient: { signOut: (...a: unknown[]) => signOut(...a) as unknown },
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('LogoutButton (FE-12/NIT-1)', () => {
  it('klik → woła authClient.signOut', async () => {
    signOut.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LogoutButton />);
    await user.click(screen.getByRole('button', { name: 'Wyloguj' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  });

  it('wyjątek sieciowy (rzut) → generyczny komunikat, przycisk znów aktywny', async () => {
    signOut.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    render(<LogoutButton />);
    await user.click(screen.getByRole('button', { name: 'Wyloguj' }));
    await waitFor(() =>
      expect(screen.getByText('Coś poszło nie tak. Spróbuj ponownie.')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Wyloguj' })).toHaveProperty('disabled', false);
  });
});
