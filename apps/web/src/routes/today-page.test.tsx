import type { Day } from '@trzy-cele/shared';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodayPage } from './today-page';

// Mockujemy klienta API dnia i sesję — testujemy routing pod-stanów HUB, nie sieć/auth.
const getToday = vi.fn();
vi.mock('../lib/api', () => ({
  getToday: (...a: unknown[]) => getToday(...a) as unknown,
}));
vi.mock('../lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
  useSession: () => ({ data: { user: { name: 'Jan', email: 'jan@example.com' } } }),
}));

// MorningForm ma własny test — tu podmieniamy na sondę, by wykryć stan „wypełnij rano".
vi.mock('./morning-form', () => ({
  MorningForm: () => <div>MORNING_FORM</div>,
}));

function pendingDay(): Day {
  return {
    id: 'd1',
    date: '2026-07-09',
    status: 'evening_pending',
    morningNote: 'poranna notatka',
    eveningNote: null,
    goals: [
      { id: 'g0', kind: 'main', position: 0, title: 'Główny cel', note: 'opis', completed: null, completedNote: null },
      { id: 'g1', kind: 'secondary', position: 1, title: 'Poboczny A', note: null, completed: null, completedNote: null },
      { id: 'g2', kind: 'secondary', position: 2, title: 'Poboczny B', note: null, completed: null, completedNote: null },
    ],
  };
}

function closedDay(): Day {
  const d = pendingDay();
  return {
    ...d,
    status: 'closed',
    eveningNote: 'wieczorna notatka',
    goals: d.goals.map((g, i) => ({ ...g, completed: i === 0, completedNote: null })),
  };
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('TodayPage (HUB)', () => {
  it('day === null → pokazuje formularz „Rano"', async () => {
    getToday.mockResolvedValue({ day: null });
    renderPage();
    await waitFor(() => expect(screen.getByText('MORNING_FORM')).toBeTruthy());
  });

  it('evening_pending → pokazuje cele + zablokowane CTA „Oznacz wieczór"', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    renderPage();
    await waitFor(() => expect(screen.getByText('Główny cel')).toBeTruthy());
    expect(screen.getByText('Poboczny A')).toBeTruthy();
    const eveningBtn = screen.getByRole('button', { name: 'Oznacz wieczór' });
    expect(eveningBtn).toHaveProperty('disabled', true);
    expect(screen.queryByText('MORNING_FORM')).toBeNull();
  });

  it('closed → podsumowanie read-only (badge zamknięty, brak CTA wieczoru)', async () => {
    getToday.mockResolvedValue({ day: closedDay() });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Ten dzień jest już podsumowany i tylko do odczytu.')).toBeTruthy(),
    );
    expect(screen.getByText('Dowiezione')).toBeTruthy();
    expect(screen.getByText('wieczorna notatka')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Oznacz wieczór' })).toBeNull();
  });

  it('błąd pobrania → ErrorState z akcją ponowienia', async () => {
    getToday.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeTruthy();
  });
});
