import type { Day } from '@trzy-cele/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodayPage } from './today-page';

// Mockujemy klienta API dnia i sesję — testujemy routing pod-stanów HUB, nie sieć/auth.
const getToday = vi.fn();
const updateMorning = vi.fn();
// getStreak używa StreakBadge w AppShell (globalny chrome) — zwracamy pending promise, by badge
// pozostał w stanie „miękkiej degradacji" (null) i nie mieszał w asercjach HUB.
vi.mock('../lib/api', () => ({
  getToday: (...a: unknown[]) => getToday(...a) as unknown,
  updateMorning: (...a: unknown[]) => updateMorning(...a) as unknown,
  getStreak: () => new Promise(() => {}),
}));
vi.mock('../lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
  useSession: () => ({ data: { user: { name: 'Jan', email: 'jan@example.com' } } }),
}));

// MorningForm ma własny test — sonda: marker + przycisk wywołujący `onSuccess` utworzonym dniem.
const CREATED_DAY: Day = {
  id: 'd-created',
  date: '2026-07-09',
  status: 'evening_pending',
  morningNote: null,
  eveningNote: null,
  goals: [
    { id: 'gc', kind: 'main', position: 0, title: 'Cel z formularza', note: null, completed: null, completedNote: null },
    { id: 'gc1', kind: 'secondary', position: 1, title: 'P1', note: null, completed: null, completedNote: null },
    { id: 'gc2', kind: 'secondary', position: 2, title: 'P2', note: null, completed: null, completedNote: null },
  ],
};
vi.mock('./morning-form', () => ({
  MorningForm: ({ heading = 'MORNING_FORM', onSuccess }: { heading?: string; onSuccess: (day: Day) => void }) => (
    <div>
      {heading}
      <button type="button" onClick={() => onSuccess(CREATED_DAY)}>
        SIMULATE_SUBMIT
      </button>
    </div>
  ),
}));

// EveningForm ma własny test — sonda: marker + przycisk wywołujący `onClosed` zamkniętym dniem.
vi.mock('./evening-form', () => ({
  EveningForm: ({ onClosed }: { onClosed: (day: Day) => void }) => (
    <div>
      EVENING_FORM
      <button type="button" onClick={() => onClosed({ ...CREATED_DAY, status: 'closed' })}>
        SIMULATE_CLOSE
      </button>
    </div>
  ),
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

  it('evening_pending → cele + aktywne akcje „Oznacz wieczór" i „Edytuj poranek"', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    renderPage();
    await waitFor(() => expect(screen.getByText('Główny cel')).toBeTruthy());
    expect(screen.getByText('Poboczny A')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Oznacz wieczór' })).toHaveProperty('disabled', false);
    expect(screen.getByRole('button', { name: 'Edytuj poranek' })).toHaveProperty('disabled', false);
    expect(screen.queryByText('MORNING_FORM')).toBeNull();
  });

  it('closed → podsumowanie read-only (badge zamknięty, brak akcji)', async () => {
    getToday.mockResolvedValue({ day: closedDay() });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Ten dzień jest już podsumowany i tylko do odczytu.')).toBeTruthy(),
    );
    expect(screen.getByText('Dowiezione')).toBeTruthy();
    expect(screen.getByText('wieczorna notatka')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Oznacz wieczór' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edytuj poranek' })).toBeNull();
  });

  it('„Oznacz wieczór" → EveningForm; zamknięcie → podsumowanie closed', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Główny cel')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Oznacz wieczór' }));
    expect(screen.getByText('EVENING_FORM')).toBeTruthy();

    // onClosed podmienia dzień na closed bez ponownego GET → podsumowanie read-only.
    await user.click(screen.getByRole('button', { name: 'SIMULATE_CLOSE' }));
    await waitFor(() =>
      expect(screen.getByText('Ten dzień jest już podsumowany i tylko do odczytu.')).toBeTruthy(),
    );
    expect(getToday).toHaveBeenCalledTimes(1);
  });

  it('„Edytuj poranek" → MorningForm w trybie edycji (heading „Edytuj poranek")', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Główny cel')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Edytuj poranek' }));
    expect(screen.getByText('Edytuj poranek')).toBeTruthy();

    // Zapis (onSuccess) wraca do widoku dnia z podmienionym dniem, bez ponownego GET.
    await user.click(screen.getByRole('button', { name: 'SIMULATE_SUBMIT' }));
    await waitFor(() => expect(screen.getByText('Cel z formularza')).toBeTruthy());
    expect(getToday).toHaveBeenCalledTimes(1);
  });

  it('onSuccess po formularzu tworzenia → pokazuje cele dnia BEZ drugiego fetcha', async () => {
    getToday.mockResolvedValue({ day: null });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('MORNING_FORM')).toBeTruthy());
    expect(getToday).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'SIMULATE_SUBMIT' }));

    await waitFor(() => expect(screen.getByText('Cel z formularza')).toBeTruthy());
    expect(screen.queryByText('MORNING_FORM')).toBeNull();
    expect(getToday).toHaveBeenCalledTimes(1);
  });

  it('błąd pobrania → ErrorState; retry faktycznie refetchuje', async () => {
    getToday.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ day: pendingDay() });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    const retry = screen.getByRole('button', { name: 'Spróbuj ponownie' });
    expect(getToday).toHaveBeenCalledTimes(1);

    await user.click(retry);

    await waitFor(() => expect(screen.getByText('Główny cel')).toBeTruthy());
    expect(getToday).toHaveBeenCalledTimes(2);
  });
});
