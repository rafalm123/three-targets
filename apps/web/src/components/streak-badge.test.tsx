import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreakBadge } from './streak-badge';

const getStreak = vi.fn();
vi.mock('../lib/api', () => ({
  getStreak: (...a: unknown[]) => getStreak(...a) as unknown,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('StreakBadge (FE-11)', () => {
  it('renderuje current i kontekst (longest/total) w tytule po sukcesie', async () => {
    getStreak.mockResolvedValue({ current: 4, longest: 9, totalDays: 20, asOfDate: '2026-07-09' });
    render(<StreakBadge />);
    await waitFor(() => expect(screen.getByText('4')).toBeTruthy());
    const badge = screen.getByLabelText(/Seria: 4 dni/);
    expect(badge.getAttribute('title')).toContain('rekord: 9');
    expect(badge.getAttribute('title')).toContain('łącznie zamkniętych: 20');
  });

  it('pluralizacja: current===1 → „1 dzień", nie „1 dni" (CR NIT-2)', async () => {
    getStreak.mockResolvedValue({ current: 1, longest: 1, totalDays: 1, asOfDate: '2026-07-09' });
    render(<StreakBadge />);
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy());
    const badge = screen.getByLabelText(/Seria: 1 dzień/);
    expect(badge.getAttribute('title')).toContain('Seria: 1 dzień');
    expect(badge.getAttribute('title')).not.toContain('1 dni');
  });

  it('pluralizacja: current===0 → „0 dni"', async () => {
    getStreak.mockResolvedValue({ current: 0, longest: 3, totalDays: 3, asOfDate: '2026-07-09' });
    render(<StreakBadge />);
    await waitFor(() => expect(screen.getByLabelText(/Seria: 0 dni/)).toBeTruthy());
  });

  it('miękka degradacja: błąd → nic nie renderuje (nie wywala ekranu)', async () => {
    getStreak.mockRejectedValue(new Error('offline'));
    const { container } = render(<StreakBadge />);
    // Po odrzuceniu nadal pusto — brak badge, brak błędu.
    await waitFor(() => expect(getStreak).toHaveBeenCalled());
    expect(container.querySelector('.streak-badge')).toBeNull();
  });
});
