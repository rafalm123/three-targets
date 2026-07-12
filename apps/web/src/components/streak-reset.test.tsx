import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreakReset } from './streak-reset';
import { StreakRefreshProvider, useStreakRefresh } from './streak-refresh';

const resetStreak = vi.fn();
// Podmieniamy tylko `resetStreak`; `ApiRequestError`/`GENERIC_API_ERROR` bierzemy z oryginału,
// bo komponent używa ich do rozróżnienia błędu HTTP od awarii sieci.
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    resetStreak: (...a: unknown[]) => resetStreak(...a) as unknown,
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

/** Sonda odsłuchująca refreshKey — rośnie, gdy reset wywoła bumpStreak. */
function RefreshProbe(): React.ReactNode {
  const { refreshKey } = useStreakRefresh();
  return <span data-testid="refresh-key">{refreshKey}</span>;
}

function renderReset(): void {
  render(
    <StreakRefreshProvider>
      <StreakReset />
      <RefreshProbe />
    </StreakRefreshProvider>,
  );
}

/** Otwarty natywny `<dialog>` ma implicytną rolę `dialog`; zamknięty jest niewidoczny dla a11y. */
function openDialogEl(): HTMLElement | null {
  return screen.queryByRole('dialog');
}

describe('StreakReset (FE-C)', () => {
  it('domyślnie: trigger „Resetuj serię" widoczny, dialog zamknięty', () => {
    renderReset();
    expect(screen.getByRole('button', { name: 'Resetuj serię' })).toBeTruthy();
    expect(openDialogEl()).toBeNull();
  });

  it('klik otwiera dialog potwierdzenia; „Anuluj" zamyka bez wywołania API', async () => {
    const user = userEvent.setup();
    renderReset();
    await user.click(screen.getByRole('button', { name: 'Resetuj serię' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toMatch(/nieodwracaln/i);

    await user.click(screen.getByRole('button', { name: 'Anuluj' }));
    await waitFor(() => expect(openDialogEl()).toBeNull());
    expect(resetStreak).not.toHaveBeenCalled();
  });

  it('potwierdzenie → woła resetStreak, zamyka dialog i bumpuje refreshKey', async () => {
    resetStreak.mockResolvedValue({
      current: 0,
      longest: 5,
      totalDays: 10,
      asOfDate: '2026-07-11',
    });
    const user = userEvent.setup();
    renderReset();
    expect(screen.getByTestId('refresh-key').textContent).toBe('0');

    await user.click(screen.getByRole('button', { name: 'Resetuj serię' }));
    await user.click(screen.getByRole('button', { name: 'Tak, zeruj' }));

    await waitFor(() => expect(resetStreak).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(openDialogEl()).toBeNull());
    // refreshKey wzrósł → StreakBadge przeładuje serię.
    await waitFor(() => expect(screen.getByTestId('refresh-key').textContent).toBe('1'));
  });

  it('błąd resetu → komunikat w dialogu, dialog zostaje, brak bumpa', async () => {
    resetStreak.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    renderReset();

    await user.click(screen.getByRole('button', { name: 'Resetuj serię' }));
    await user.click(screen.getByRole('button', { name: 'Tak, zeruj' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    // Dialog nadal otwarty (użytkownik może ponowić lub anulować), refreshKey bez zmian.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('refresh-key').textContent).toBe('0');
  });

  it('Esc zamyka dialog (natywny cancel), ale NIE w trakcie żądania (M1)', async () => {
    // resetStreak wisi (pending) → symulujemy trwające żądanie: Esc nie może zamknąć.
    let resolve!: () => void;
    resetStreak.mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    renderReset();

    await user.click(screen.getByRole('button', { name: 'Resetuj serię' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Startujemy reset → przycisk „Zerowanie…" (disabled), żądanie w toku.
    await user.click(screen.getByRole('button', { name: 'Tak, zeruj' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zerowanie…' })).toBeTruthy());

    // Esc w trakcie żądania → dialog zostaje (guard `resetting`).
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Kończymy żądanie (sukces) → dialog zamknięty przez confirmReset.
    resolve();
    await waitFor(() => expect(openDialogEl()).toBeNull());

    // Ponownie otwieramy i tym razem Esc (bez żądania) → dialog się zamyka.
    await user.click(screen.getByRole('button', { name: 'Resetuj serię' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(openDialogEl()).toBeNull());
  });

  it('double-submit zablokowany: w trakcie żądania oba przyciski disabled, klik nie duplikuje API (m4)', async () => {
    let resolve!: () => void;
    resetStreak.mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const user = userEvent.setup();
    renderReset();

    await user.click(screen.getByRole('button', { name: 'Resetuj serię' }));
    await user.click(screen.getByRole('button', { name: 'Tak, zeruj' }));

    // W toku: „Zerowanie…" i „Anuluj" disabled → ponowny klik nie odpala drugiego resetu.
    const confirm = await screen.findByRole('button', { name: 'Zerowanie…' });
    expect(confirm).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Anuluj' })).toHaveProperty('disabled', true);
    await user.click(confirm);
    expect(resetStreak).toHaveBeenCalledTimes(1);

    resolve();
    await waitFor(() => expect(openDialogEl()).toBeNull());
  });
});
