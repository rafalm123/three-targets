import type { Day, DaySummary } from '@trzy-cele/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryPage } from './history-page';

const getHistory = vi.fn();
const getDayByDate = vi.fn();
vi.mock('../lib/api', () => ({
  getHistory: (...a: unknown[]) => getHistory(...a) as unknown,
  getDayByDate: (...a: unknown[]) => getDayByDate(...a) as unknown,
  getStreak: () => new Promise(() => {}), // AppShell/StreakBadge — miękka degradacja (pending)
}));
vi.mock('../lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
}));

function summary(date: string, mainTitle: string): DaySummary {
  return { date, status: 'closed', mainTitle, goalsCompleted: [true, false, null] };
}

function closedDay(date: string): Day {
  return {
    id: `d-${date}`,
    date,
    status: 'closed',
    morningNote: 'poranna',
    eveningNote: 'wieczorna',
    goals: [
      { id: 'g0', kind: 'main', position: 0, title: 'Główny szczegół', note: null, completed: true, completedNote: null },
      { id: 'g1', kind: 'secondary', position: 1, title: 'P1', note: null, completed: false, completedNote: null },
      { id: 'g2', kind: 'secondary', position: 2, title: 'P2', note: null, completed: null, completedNote: null },
    ],
  };
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <HistoryPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('HistoryPage (FE-10)', () => {
  it('pusta historia → EmptyState', async () => {
    getHistory.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    await waitFor(() => expect(screen.getByText('Brak historii')).toBeTruthy());
  });

  it('błąd pobrania → ErrorState z ponowieniem', async () => {
    getHistory.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeTruthy();
  });

  it('lista dni + paginacja „Pokaż starsze" doładowuje starsze', async () => {
    getHistory
      .mockResolvedValueOnce({ items: [summary('2026-07-08', 'Dzień A')], nextCursor: '2026-07-08' })
      .mockResolvedValueOnce({ items: [summary('2026-07-07', 'Dzień B')], nextCursor: null });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Dzień A')).toBeTruthy());

    const more = screen.getByRole('button', { name: 'Pokaż starsze' });
    await user.click(more);

    await waitFor(() => expect(screen.getByText('Dzień B')).toBeTruthy());
    // Druga strona z kursorem poprzedniej, po niej brak — przycisk znika.
    expect(getHistory).toHaveBeenNthCalledWith(2, '2026-07-08');
    expect(screen.queryByRole('button', { name: 'Pokaż starsze' })).toBeNull();
  });

  it('klik w dzień → szczegół read-only z notatkami (getDayByDate)', async () => {
    getHistory.mockResolvedValue({ items: [summary('2026-07-08', 'Dzień A')], nextCursor: null });
    getDayByDate.mockResolvedValue({ day: closedDay('2026-07-08') });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Dzień A')).toBeTruthy());

    await user.click(screen.getByText('Dzień A'));

    await waitFor(() => expect(screen.getByText('Główny szczegół')).toBeTruthy());
    expect(getDayByDate).toHaveBeenCalledWith('2026-07-08');
    // Szczegół pokazuje notatki (historia listowa ich nie ma).
    expect(screen.getByText('poranna')).toBeTruthy();
    expect(screen.getByText('wieczorna')).toBeTruthy();

    // Powrót do listy.
    await user.click(screen.getByRole('button', { name: '← Wróć do historii' }));
    await waitFor(() => expect(screen.getByText('Dzień A')).toBeTruthy());
  });
});
