import type { ChallengeSummary, ChallengeWithPoints } from '@trzy-cele/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChallengePage } from './challenge-page';

// Mockujemy klienta API i auth — testujemy routing HUB / widok aktywnej / historię, nie sieć.
const getActiveChallenge = vi.fn();
const listChallenges = vi.fn();
const createChallenge = vi.fn();

vi.mock('../lib/api', () => ({
  getActiveChallenge: (...a: unknown[]) => getActiveChallenge(...a) as unknown,
  listChallenges: (...a: unknown[]) => listChallenges(...a) as unknown,
  createChallenge: (...a: unknown[]) => createChallenge(...a) as unknown,
  // ChallengeCreateForm importuje te dwa z ../lib/api:
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  GENERIC_API_ERROR: 'Coś poszło nie tak. Spróbuj ponownie.',
  getStreak: () => new Promise(() => {}), // StreakBadge w AppShell — miękka degradacja (pending)
}));
vi.mock('../lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
  useSession: () => ({ data: { user: { name: 'Jan', email: 'jan@example.com' } } }),
}));
vi.mock('../components/streak-reset', () => ({ StreakReset: () => <span>STREAK_RESET</span> }));

const ACTIVE: ChallengeWithPoints = {
  id: 'ch-1',
  title: 'Lipiec',
  startDate: '2026-07-13',
  endDate: '2026-08-11',
  createdAt: '2026-07-13T08:00:00.000Z',
  totalPoints: 7,
  nextThreshold: 10,
  pointsToNext: 3,
  tiers: [
    { threshold: 10, reward: 'Kino', unlocked: false },
    { threshold: 20, reward: 'Książka', unlocked: false },
  ],
};

const ALL_UNLOCKED: ChallengeWithPoints = {
  ...ACTIVE,
  totalPoints: 25,
  nextThreshold: null,
  pointsToNext: null,
  tiers: [
    { threshold: 10, reward: 'Kino', unlocked: true },
    { threshold: 20, reward: 'Książka', unlocked: true },
  ],
};

// Rozrzedzone progi: user wybrał tylko [20, 50]. total=30 → próg 20 odblokowany, następny 50.
// Okno paska = [20, 50], now=30 → ~33%, a ARIA valuenow(30) w [20,50] (poprzedni bug: valuemin=40).
const SPARSE: ChallengeWithPoints = {
  ...ACTIVE,
  totalPoints: 30,
  nextThreshold: 50,
  pointsToNext: 20,
  tiers: [
    { threshold: 20, reward: 'Kino', unlocked: true },
    { threshold: 50, reward: 'Weekend', unlocked: false },
  ],
};

const SUMMARY: ChallengeSummary = {
  id: 'ch-old',
  title: 'Czerwiec',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  totalPoints: 42,
};

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/cele']}>
      <ChallengePage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ChallengePage (FE-P2/P3)', () => {
  it('błąd pobrania aktywnej → ErrorState z ponowieniem', async () => {
    getActiveChallenge.mockRejectedValue(new Error('boom'));
    listChallenges.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Nie udało się wczytać listy celów.')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie' })).toBeTruthy();
  });

  it('brak aktywnej → ekran „Utwórz listę"', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: null });
    listChallenges.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Utwórz listę celów' })).toBeTruthy(),
    );
    // Wiersze progów 10..60.
    expect(screen.getByLabelText('10 pkt')).toBeTruthy();
    expect(screen.getByLabelText('60 pkt')).toBeTruthy();
  });

  it('tworzenie: walidacja — bez żadnej nagrody nie woła API, pokazuje błąd', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: null });
    listChallenges.mockResolvedValue({ items: [] });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Utwórz listę celów' })).toBeTruthy(),
    );
    await user.click(screen.getByRole('button', { name: 'Utwórz listę' }));
    expect(screen.getByRole('alert').textContent).toContain('co najmniej jedną nagrodę');
    expect(createChallenge).not.toHaveBeenCalled();
  });

  it('tworzenie: wpisuje nagrodę + tytuł → createChallenge z payloadem, HUB pokazuje aktywną', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: null });
    listChallenges.mockResolvedValue({ items: [] });
    createChallenge.mockResolvedValue(ACTIVE);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Utwórz listę celów' })).toBeTruthy(),
    );

    await user.type(screen.getByLabelText('Tytuł (opcjonalnie)'), 'Lipiec');
    await user.type(screen.getByLabelText('10 pkt'), 'Kino');
    await user.click(screen.getByRole('button', { name: 'Utwórz listę' }));

    await waitFor(() => expect(createChallenge).toHaveBeenCalledTimes(1));
    expect(createChallenge).toHaveBeenCalledWith({
      title: 'Lipiec',
      tiers: [{ threshold: 10, reward: 'Kino' }],
    });
    // Po sukcesie HUB przełącza na widok aktywnej (bez ponownego fetcha).
    await waitFor(() => expect(screen.getByText('Lipiec')).toBeTruthy());
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('tworzenie: double-submit w trakcie żądania NIE woła API drugi raz (twardy guard)', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: null });
    listChallenges.mockResolvedValue({ items: [] });
    // Trzymamy pierwsze żądanie „w locie" (nierozwiązane), by `submitting` pozostał true.
    let resolveCreate: (v: ChallengeWithPoints) => void = () => {};
    createChallenge.mockReturnValue(
      new Promise<ChallengeWithPoints>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Utwórz listę celów' })).toBeTruthy(),
    );
    await user.type(screen.getByLabelText('10 pkt'), 'Kino');

    const submit = screen.getByRole('button', { name: 'Utwórz listę' });
    await user.click(submit);
    // Przycisk jest teraz disabled („Tworzenie…"); wołamy handler jeszcze raz przez submit formularza,
    // żeby ominąć `disabled` i dowieść, że TWARDY guard `if (submitting) return` blokuje drugie żądanie.
    const form = submit.closest('form') as HTMLFormElement;
    form.requestSubmit();

    expect(createChallenge).toHaveBeenCalledTimes(1);

    // Sprzątanie: rozwiąż wiszące żądanie.
    resolveCreate(ACTIVE);
    await waitFor(() => expect(screen.getByText('7')).toBeTruthy());
  });

  it('tworzenie: 409 ACTIVE_CHALLENGE_EXISTS → przeładowanie HUB pokazuje aktywną', async () => {
    const { ApiRequestError } = await import('../lib/api');
    getActiveChallenge
      .mockResolvedValueOnce({ challenge: null })
      .mockResolvedValueOnce({ challenge: ACTIVE });
    listChallenges.mockResolvedValue({ items: [] });
    createChallenge.mockRejectedValue(
      new ApiRequestError('Masz już aktywną listę', 409, 'ACTIVE_CHALLENGE_EXISTS'),
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Utwórz listę celów' })).toBeTruthy(),
    );
    await user.type(screen.getByLabelText('10 pkt'), 'Kino');
    await user.click(screen.getByRole('button', { name: 'Utwórz listę' }));

    await waitFor(() => expect(screen.getByText('Lipiec')).toBeTruthy());
    expect(getActiveChallenge).toHaveBeenCalledTimes(2);
  });

  it('aktywna: punkty, pasek postępu do progu, progi z locked/unlocked', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: ACTIVE });
    listChallenges.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Lipiec')).toBeTruthy());

    expect(screen.getByText('7')).toBeTruthy();
    const bar = screen.getByRole('progressbar');
    // Żaden próg jeszcze odblokowany → okno startuje od 0.
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuenow')).toBe('7');
    expect(bar.getAttribute('aria-valuemax')).toBe('10');

    const tierList = screen.getByRole('list', { name: 'Progi i nagrody' });
    expect(within(tierList).getByText('Kino')).toBeTruthy();
    // Oba progi zablokowane (unlocked=false).
    expect(within(tierList).getAllByText('Zablokowane')).toHaveLength(2);
  });

  it('aktywna: ROZRZEDZONE progi [20,50], total=30 → pasek ~33% i ARIA w zakresie (regresja)', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: SPARSE });
    listChallenges.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Lipiec')).toBeTruthy());

    const bar = screen.getByRole('progressbar');
    // Okno = [20, 50] (najwyższy odblokowany = 20, następny = 50), now = 30 → wszystkie w zakresie.
    expect(bar.getAttribute('aria-valuemin')).toBe('20');
    expect(bar.getAttribute('aria-valuemax')).toBe('50');
    expect(bar.getAttribute('aria-valuenow')).toBe('30');
    // valuenow leży w [valuemin, valuemax] — NIE poza zakresem (dawny bug: valuemin=40 > now=30).
    const min = Number(bar.getAttribute('aria-valuemin'));
    const max = Number(bar.getAttribute('aria-valuemax'));
    const now = Number(bar.getAttribute('aria-valuenow'));
    expect(now).toBeGreaterThanOrEqual(min);
    expect(now).toBeLessThanOrEqual(max);
    // Wypełnienie ~33% ((30-20)/(50-20)); sprawdzamy szerokość inline.
    const fill = bar.querySelector('.challenge-progress-fill') as HTMLElement;
    expect(fill.style.width).toBe('33%');
  });

  it('aktywna: wszystkie progi zdobyte (nextThreshold=null) → komunikat zamiast paska', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: ALL_UNLOCKED });
    listChallenges.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Wszystkie progi zdobyte. Brawo!')).toBeTruthy());
    expect(screen.queryByRole('progressbar')).toBeNull();
    const tierList = screen.getByRole('list', { name: 'Progi i nagrody' });
    expect(within(tierList).getAllByText('Odblokowane')).toHaveLength(2);
  });

  it('historia: lista zakończonych z finalnym totalPoints', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: null });
    listChallenges.mockResolvedValue({ items: [SUMMARY] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Czerwiec')).toBeTruthy());
    expect(screen.getByText(/42/)).toBeTruthy();
  });

  it('historia: pusta → EmptyState', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: null });
    listChallenges.mockResolvedValue({ items: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Brak zakończonych list')).toBeTruthy());
  });

  it('historia: błąd → ErrorState (nie psuje widoku aktywnej)', async () => {
    getActiveChallenge.mockResolvedValue({ challenge: ACTIVE });
    listChallenges.mockRejectedValue(new Error('boom'));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Nie udało się wczytać historii list.')).toBeTruthy(),
    );
    // Widok aktywnej nadal jest.
    expect(screen.getByText('Lipiec')).toBeTruthy();
  });
});
