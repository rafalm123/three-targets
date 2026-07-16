import type { Day } from '@trzy-cele/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodayPage } from './today-page';

// Mockujemy klienta API dnia i sesję — testujemy routing pod-stanów HUB, nie sieć/auth.
const getToday = vi.fn();
const updateMorning = vi.fn();
const markGoal = vi.fn();
const getDayByDate = vi.fn();
// getStreak używa StreakBadge (chrome) i kotwica wczoraj (gdy brak dzisiejszego dnia). Domyślnie
// zwraca poprawny Streak (asOfDate = kotwica); wywołania są policzalne (test odświeżenia serii).
const getStreak = vi.fn(() =>
  Promise.resolve({ current: 0, longest: 0, totalDays: 0, asOfDate: '2026-07-16' }),
);
vi.mock('../lib/api', () => ({
  getToday: (...a: unknown[]) => getToday(...a) as unknown,
  updateMorning: (...a: unknown[]) => updateMorning(...a) as unknown,
  markGoal: (...a: unknown[]) => markGoal(...a) as unknown,
  getDayByDate: (...a: unknown[]) => getDayByDate(...a) as unknown,
  getStreak: () => getStreak() as unknown,
}));
vi.mock('../lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
  useSession: () => ({ data: { user: { name: 'Jan', email: 'jan@example.com' } } }),
}));
vi.mock('../components/streak-reset', () => ({ StreakReset: () => <span>STREAK_RESET</span> }));

// DayMarking ma własne testy (jednostki GoalMarkRow/EveningForm) — sonda: marker + przyciski
// wywołujące callbacki (podmiana dnia, konflikt, oznaczenie głównego = bump serii).
const CLOSED_FROM_MARKING: Day = {
  id: 'd-closed',
  date: '2026-07-09',
  status: 'closed',
  morningNote: null,
  eveningNote: 'wieczorna',
  goals: [],
};
vi.mock('./day-marking', () => ({
  DayMarking: ({
    day,
    onDayChange,
    onConflict,
    onMainMarked,
  }: {
    day: Day;
    onDayChange: (d: Day) => void;
    onConflict: (c: string) => void;
    onMainMarked: () => void;
  }) => (
    <div>
      DAY_MARKING:{day.date}
      <button type="button" onClick={onMainMarked}>
        SIMULATE_MAIN_MARK
      </button>
      <button type="button" onClick={() => onDayChange({ ...CLOSED_FROM_MARKING, date: day.date })}>
        SIMULATE_CLOSE
      </button>
      <button type="button" onClick={() => onConflict('DAY_FROZEN')}>
        SIMULATE_CONFLICT
      </button>
    </div>
  ),
}));

const CREATED_DAY: Day = {
  id: 'd-created',
  date: '2026-07-09',
  status: 'evening_pending',
  morningNote: null,
  eveningNote: null,
  goals: [],
};
const EDITED_CLOSED_DAY: Day = { ...CREATED_DAY, id: 'd-edited', status: 'closed' };
vi.mock('./morning-form', () => ({
  MorningForm: ({
    heading = 'MORNING_FORM',
    onSuccess,
    onConflict,
  }: {
    heading?: string;
    onSuccess: (day: Day) => void;
    onConflict?: (code: string) => void;
  }) => (
    <div>
      {heading}
      <button type="button" onClick={() => onSuccess(CREATED_DAY)}>
        SIMULATE_SUBMIT
      </button>
      <button type="button" onClick={() => onSuccess(EDITED_CLOSED_DAY)}>
        SIMULATE_SUBMIT_CLOSED
      </button>
      <button type="button" onClick={() => onConflict?.('DAY_ALREADY_CLOSED')}>
        SIMULATE_CONFLICT
      </button>
    </div>
  ),
}));

function pendingDay(date = '2026-07-09'): Day {
  return {
    id: 'd1',
    date,
    status: 'evening_pending',
    morningNote: 'poranna notatka',
    eveningNote: null,
    goals: [
      { id: 'g0', kind: 'main', position: 0, title: 'Główny cel', note: 'opis', completed: null, completedNote: null },
    ],
  };
}

function closedDay(): Day {
  return {
    ...pendingDay(),
    status: 'closed',
    eveningNote: 'wieczorna notatka',
    goals: [{ ...pendingDay().goals[0]!, completed: true }],
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
    getDayByDate.mockResolvedValue({ day: null });
    renderPage();
    await waitFor(() => expect(screen.getByText('MORNING_FORM')).toBeTruthy());
  });

  it('evening_pending → oznaczanie per-cel (DayMarking) + „Edytuj poranek"', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    getDayByDate.mockResolvedValue({ day: null });
    renderPage();
    await waitFor(() => expect(screen.getByText('DAY_MARKING:2026-07-09')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Edytuj poranek' })).toHaveProperty('disabled', false);
    expect(screen.queryByText('MORNING_FORM')).toBeNull();
  });

  it('oznaczenie głównego (DayMarking) bumpuje serię', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    getDayByDate.mockResolvedValue({ day: null });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('DAY_MARKING:2026-07-09')).toBeTruthy());
    expect(getStreak).toHaveBeenCalledTimes(1); // mount StreakBadge

    await user.click(screen.getByRole('button', { name: 'SIMULATE_MAIN_MARK' }));
    await waitFor(() => expect(getStreak).toHaveBeenCalledTimes(2));
  });

  it('domknięcie w DayMarking → podsumowanie closed (bez drugiego GET)', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    getDayByDate.mockResolvedValue({ day: null });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('DAY_MARKING:2026-07-09')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'SIMULATE_CLOSE' }));
    await waitFor(() =>
      expect(
        screen.getByText('Ten dzień jest podsumowany — ale dopóki trwa, możesz go jeszcze poprawić.'),
      ).toBeTruthy(),
    );
    expect(getToday).toHaveBeenCalledTimes(1);
  });

  it('closed → „Edytuj dziś" odsłania oznaczanie per-cel i edycję poranka', async () => {
    getToday.mockResolvedValue({ day: closedDay() });
    getDayByDate.mockResolvedValue({ day: null });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Dowiezione')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Edytuj dziś' })).toHaveProperty('disabled', false);

    await user.click(screen.getByRole('button', { name: 'Edytuj dziś' }));
    expect(screen.getByText('DAY_MARKING:2026-07-09')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edytuj poranek' })).toBeTruthy();
  });

  it('„Edytuj poranek" → MorningForm; zapis wraca do widoku bez drugiego GET', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    getDayByDate.mockResolvedValue({ day: null });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('DAY_MARKING:2026-07-09')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Edytuj poranek' }));
    expect(screen.getByText('Edytuj poranek')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'SIMULATE_SUBMIT' }));
    await waitFor(() => expect(screen.getByText('DAY_MARKING:2026-07-09')).toBeTruthy());
    expect(getToday).toHaveBeenCalledTimes(1);
  });

  it('konflikt (DAY_FROZEN z DayMarking) → notice + refetch getToday', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    getDayByDate.mockResolvedValue({ day: null });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('DAY_MARKING:2026-07-09')).toBeTruthy());
    expect(getToday).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'SIMULATE_CONFLICT' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/zamknięty do edycji/)).toBeTruthy();
    await waitFor(() => expect(getToday).toHaveBeenCalledTimes(2));
  });

  it('baner „Dokończ wczoraj" pojawia się TYLKO dla wczoraj-evening_pending', async () => {
    getToday.mockResolvedValue({ day: pendingDay('2026-07-16') });
    getDayByDate.mockResolvedValue({ day: pendingDay('2026-07-15') });
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Dokończ wczorajszy dzień')).toBeTruthy());
    // Kotwica = dzisiejszy day.date (2026-07-16) → wczoraj = 2026-07-15.
    expect(getDayByDate).toHaveBeenCalledWith('2026-07-15');
    // Baner operuje na dacie wczorajszej.
    expect(screen.getByText('DAY_MARKING:2026-07-15')).toBeTruthy();
  });

  it('baner NIE pojawia się gdy wczoraj closed', async () => {
    getToday.mockResolvedValue({ day: pendingDay('2026-07-16') });
    getDayByDate.mockResolvedValue({ day: { ...pendingDay('2026-07-15'), status: 'closed' as const } });
    renderPage();
    await waitFor(() => expect(screen.getByText('DAY_MARKING:2026-07-16')).toBeTruthy());
    expect(screen.queryByLabelText('Dokończ wczorajszy dzień')).toBeNull();
  });

  it('kotwica wczoraj z asOfDate gdy dziś brak wpisu', async () => {
    getToday.mockResolvedValue({ day: null });
    getDayByDate.mockResolvedValue({ day: pendingDay('2026-07-15') });
    renderPage();
    // Dziś brak wpisu → MorningForm; kotwica z asOfDate (2026-07-16) → wczoraj = 2026-07-15.
    await waitFor(() => expect(screen.getByLabelText('Dokończ wczorajszy dzień')).toBeTruthy());
    expect(getDayByDate).toHaveBeenCalledWith('2026-07-15');
  });

  it('błąd pobrania → ErrorState; retry refetchuje', async () => {
    getToday.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ day: pendingDay() });
    getDayByDate.mockResolvedValue({ day: null });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(getToday).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    await waitFor(() => expect(screen.getByText('DAY_MARKING:2026-07-09')).toBeTruthy());
    expect(getToday).toHaveBeenCalledTimes(2);
  });
});
