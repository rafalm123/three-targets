import type { Day } from '@trzy-cele/shared';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/api';
import { HistoryDayPage } from './history-day-page';

const getDayByDate = vi.fn();
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getDayByDate: (...a: unknown[]) => getDayByDate(...a) as unknown,
    getStreak: () => new Promise(() => {}), // AppShell/StreakBadge — miękka degradacja
  };
});
vi.mock('../lib/auth-client', () => ({
  authClient: { signOut: vi.fn() },
}));

function closedDay(date: string): Day {
  return {
    id: `d-${date}`,
    date,
    status: 'closed',
    morningNote: 'poranna notatka',
    eveningNote: 'wieczorna notatka',
    goals: [
      { id: 'g0', kind: 'main', position: 0, title: 'Główny z trasy', note: null, completed: true, completedNote: null },
      { id: 'g1', kind: 'secondary', position: 1, title: 'P1', note: null, completed: false, completedNote: null },
      { id: 'g2', kind: 'secondary', position: 2, title: 'P2', note: null, completed: null, completedNote: null },
    ],
  };
}

/** Renderuje szczegół pod `/historia/:date` — symuluje deep-link/refresh na trasie. */
function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/historia/:date" element={<HistoryDayPage />} />
        <Route path="/historia" element={<div>LISTA_HISTORII</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('HistoryDayPage (FE-13, trasa /historia/:date)', () => {
  it('czyta datę z useParams i renderuje dzień (deep-link/refresh)', async () => {
    getDayByDate.mockResolvedValue({ day: closedDay('2026-07-08') });
    renderAt('/historia/2026-07-08');
    await waitFor(() => expect(screen.getByText('Główny z trasy')).toBeTruthy());
    // Data z param trafia do klienta — bez stanu lokalnego.
    expect(getDayByDate).toHaveBeenCalledWith('2026-07-08');
    expect(screen.getByText('poranna notatka')).toBeTruthy();
  });

  it('brak wpisu na datę (day===null) → EmptyState, nie crash', async () => {
    getDayByDate.mockResolvedValue({ day: null });
    renderAt('/historia/2026-07-01');
    await waitFor(() => expect(screen.getByText('Brak wpisu')).toBeTruthy());
    expect(screen.getByRole('link', { name: '← Wróć do historii' })).toBeTruthy();
  });

  it('zły format daty → stan błędu bez wołania API, z linkiem powrotu', async () => {
    renderAt('/historia/not-a-date');
    expect(
      screen.getByText('Adres nie wskazuje poprawnego dnia. Wróć do historii i wybierz dzień z listy.'),
    ).toBeTruthy();
    expect(getDayByDate).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: '← Wróć do historii' })).toBeTruthy();
  });

  it('przyszła/niepoprawna data po stronie BE (400) → ErrorState z powrotem', async () => {
    getDayByDate.mockRejectedValue(new ApiRequestError('Data z przyszłości', 400, 'FUTURE_DATE'));
    renderAt('/historia/2030-01-01');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Nie udało się wczytać tego dnia.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Wróć do historii' })).toBeTruthy();
  });

  it('link „Wróć do historii" prowadzi do /historia', async () => {
    getDayByDate.mockResolvedValue({ day: closedDay('2026-07-08') });
    renderAt('/historia/2026-07-08');
    await waitFor(() => expect(screen.getByText('Główny z trasy')).toBeTruthy());
    expect(screen.getByRole('link', { name: '← Wróć do historii' }).getAttribute('href')).toBe(
      '/historia',
    );
  });
});
