import type { Day } from '@trzy-cele/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodayPage } from './today-page';

// Mockujemy klienta API dnia i sesję — testujemy routing pod-stanów HUB, nie sieć/auth.
const getToday = vi.fn();
const updateMorning = vi.fn();
// getStreak używa StreakBadge w AppShell (globalny chrome) — pending promise: badge zostaje w
// „miękkiej degradacji" (null), a wywołania są policzalne (do testu odświeżenia po zamknięciu dnia).
const getStreak = vi.fn(() => new Promise(() => {}));
vi.mock('../lib/api', () => ({
  getToday: (...a: unknown[]) => getToday(...a) as unknown,
  updateMorning: (...a: unknown[]) => updateMorning(...a) as unknown,
  getStreak: () => getStreak() as unknown,
}));
vi.mock('../lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
  useSession: () => ({ data: { user: { name: 'Jan', email: 'jan@example.com' } } }),
}));
// StreakReset renderuje się w AppShell (globalny chrome) i woła własne API — ma swój test.
// Podmieniamy na marker, żeby nie wciągać `resetStreak`/`ApiRequestError` do mocka `../lib/api` tutaj.
vi.mock('../components/streak-reset', () => ({ StreakReset: () => <span>STREAK_RESET</span> }));

// MorningForm ma własny test — sonda: marker + przycisk wywołujący `onSuccess` utworzonym dniem.
const CREATED_DAY: Day = {
  id: 'd-created',
  date: '2026-07-09',
  status: 'evening_pending',
  morningNote: null,
  eveningNote: null,
  goals: [
    {
      id: 'gc',
      kind: 'main',
      position: 0,
      title: 'Cel z formularza',
      note: null,
      completed: null,
      completedNote: null,
    },
    {
      id: 'gc1',
      kind: 'secondary',
      position: 1,
      title: 'P1',
      note: null,
      completed: null,
      completedNote: null,
    },
    {
      id: 'gc2',
      kind: 'secondary',
      position: 2,
      title: 'P2',
      note: null,
      completed: null,
      completedNote: null,
    },
  ],
};
// Dzień zamknięty po edycji poranka (PATCH nie zmienia statusu — zostaje `closed`), z nowym tytułem
// głównego. Sonda dla testu „closed → edycja poranka wraca do PODSUMOWANIA closed z nowym tytułem".
const EDITED_CLOSED_DAY: Day = {
  ...CREATED_DAY,
  id: 'd-edited',
  status: 'closed',
  eveningNote: 'wieczorna notatka',
  goals: CREATED_DAY.goals.map((g, i) => ({
    ...g,
    title: g.kind === 'main' ? 'Poprawiony główny' : g.title,
    completed: i === 0,
  })),
};
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
      {
        id: 'g0',
        kind: 'main',
        position: 0,
        title: 'Główny cel',
        note: 'opis',
        completed: null,
        completedNote: null,
      },
      {
        id: 'g1',
        kind: 'secondary',
        position: 1,
        title: 'Poboczny A',
        note: null,
        completed: null,
        completedNote: null,
      },
      {
        id: 'g2',
        kind: 'secondary',
        position: 2,
        title: 'Poboczny B',
        note: null,
        completed: null,
        completedNote: null,
      },
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
    expect(screen.getByRole('button', { name: 'Oznacz wieczór' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.getByRole('button', { name: 'Edytuj poranek' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(screen.queryByText('MORNING_FORM')).toBeNull();
  });

  it('closed → podsumowanie + akcja „Edytuj dziś" (dziś edytowalny mimo zamknięcia)', async () => {
    getToday.mockResolvedValue({ day: closedDay() });
    renderPage();
    await waitFor(() => expect(screen.getByText('Dowiezione')).toBeTruthy());
    expect(screen.getByText('wieczorna notatka')).toBeTruthy();
    // Dzisiejszy dzień po zamknięciu jest wciąż edytowalny → akcja „Edytuj dziś".
    expect(screen.getByRole('button', { name: 'Edytuj dziś' })).toHaveProperty('disabled', false);
  });

  it('closed → „Edytuj dziś" odsłania akcje: poprawa poranka (PATCH) i ponowny wieczór', async () => {
    getToday.mockResolvedValue({ day: closedDay() });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Dowiezione')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Edytuj dziś' }));
    expect(screen.getByRole('button', { name: 'Edytuj poranek' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Oznacz wieczór ponownie' })).toBeTruthy();
  });

  it('closed → edycja poranka (PATCH) wraca do PODSUMOWANIA closed z nowym tytułem (status bez zmian)', async () => {
    getToday.mockResolvedValue({ day: closedDay() });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Dowiezione')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Edytuj dziś' }));
    await user.click(screen.getByRole('button', { name: 'Edytuj poranek' }));
    expect(screen.getByText('Edytuj poranek')).toBeTruthy();

    // PATCH nie zmienia statusu: onSuccess(EDITED_CLOSED_DAY) → wciąż `closed`, nowy tytuł głównego.
    await user.click(screen.getByRole('button', { name: 'SIMULATE_SUBMIT_CLOSED' }));
    await waitFor(() => expect(screen.getByText('Poprawiony główny')).toBeTruthy());
    // Nadal podsumowanie closed (nie PendingDay): komunikat „Edytuj dziś" obecny.
    expect(screen.getByRole('button', { name: 'Edytuj dziś' })).toBeTruthy();
    expect(getToday).toHaveBeenCalledTimes(1);
  });

  it('closed → ponowny wieczór (re-submit) zamyka dzień i bumpuje streak', async () => {
    getToday.mockResolvedValue({ day: closedDay() });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Dowiezione')).toBeTruthy());
    expect(getStreak).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Edytuj dziś' }));
    await user.click(screen.getByRole('button', { name: 'Oznacz wieczór ponownie' }));
    expect(screen.getByText('EVENING_FORM')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'SIMULATE_CLOSE' }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Ten dzień jest podsumowany — ale dopóki trwa, możesz go jeszcze poprawić.',
        ),
      ).toBeTruthy(),
    );
    // Re-submit mógł zmienić dowiezienie głównego celu → seria mogła się zmienić: bump.
    await waitFor(() => expect(getStreak).toHaveBeenCalledTimes(2));
  });

  it('„Oznacz wieczór" → EveningForm; zamknięcie → podsumowanie closed', async () => {
    getToday.mockResolvedValue({ day: pendingDay() });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Główny cel')).toBeTruthy());

    await user.click(screen.getByRole('button', { name: 'Oznacz wieczór' }));
    expect(screen.getByText('EVENING_FORM')).toBeTruthy();

    // getStreak wołany na mount (StreakBadge). Po zamknięciu dnia ma być refetchowany (CR NIT-1).
    expect(getStreak).toHaveBeenCalledTimes(1);

    // onClosed podmienia dzień na closed bez ponownego GET → podsumowanie read-only.
    await user.click(screen.getByRole('button', { name: 'SIMULATE_CLOSE' }));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Ten dzień jest podsumowany — ale dopóki trwa, możesz go jeszcze poprawić.',
        ),
      ).toBeTruthy(),
    );
    expect(getToday).toHaveBeenCalledTimes(1);
    // Zamknięcie dnia bumpuje refreshKey → StreakBadge fetchuje serię ponownie (nagroda widoczna od razu).
    await waitFor(() => expect(getStreak).toHaveBeenCalledTimes(2));
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

  it('konflikt mutacji (409) → notice + refetch getToday (ścieżka obronna handleConflict)', async () => {
    // 1. mount: evening_pending; 2. refetch po konflikcie: świeży pending.
    getToday.mockResolvedValue({ day: pendingDay() });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Główny cel')).toBeTruthy());
    expect(getToday).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Edytuj poranek' }));
    await user.click(screen.getByRole('button', { name: 'SIMULATE_CONFLICT' }));

    // handleConflict: pokazuje neutralne notice (rola alert) i przeładowuje dzień.
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/Stan dnia zmienił się w międzyczasie/)).toBeTruthy();
    await waitFor(() => expect(getToday).toHaveBeenCalledTimes(2));
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
