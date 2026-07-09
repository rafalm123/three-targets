import type { Day } from '@trzy-cele/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/api';
import { EveningForm } from './evening-form';

// submitEvening mockowany; ApiRequestError realny (testujemy 409/400 po code).
const submitEvening = vi.fn();
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, submitEvening: (...a: unknown[]) => submitEvening(...a) as unknown };
});

function pendingDay(): Day {
  return {
    id: 'd1',
    date: '2026-07-09',
    status: 'evening_pending',
    morningNote: null,
    eveningNote: null,
    goals: [
      { id: 'g-main', kind: 'main', position: 0, title: 'Główny', note: null, completed: null, completedNote: null },
      { id: 'g-s1', kind: 'secondary', position: 1, title: 'Poboczny A', note: null, completed: null, completedNote: null },
      { id: 'g-s2', kind: 'secondary', position: 2, title: 'Poboczny B', note: null, completed: null, completedNote: null },
    ],
  };
}

function renderForm(overrides?: { onClosed?: () => void; onConflict?: () => void }) {
  const onClosed = vi.fn(overrides?.onClosed);
  const onConflict = vi.fn(overrides?.onConflict);
  render(<EveningForm day={pendingDay()} onClosed={onClosed} onConflict={onConflict} />);
  return { onClosed, onConflict };
}

/** Zaznacza wszystkie 3 cele jako dowiezione (radio „Dowiezione" w każdym fieldsecie). */
async function markAllDone(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const done = screen.getAllByRole('radio', { name: 'Dowiezione' });
  for (const radio of done) await user.click(radio);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('EveningForm (FE-8)', () => {
  it('renderuje 3 cele z tytułami z dnia', () => {
    renderForm();
    expect(screen.getByText(/Główny/)).toBeTruthy();
    expect(screen.getByText(/Poboczny A/)).toBeTruthy();
    expect(screen.getByText(/Poboczny B/)).toBeTruthy();
  });

  it('brak wyboru dowieziony/nie → komunikat, brak wywołania API', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));
    await waitFor(() =>
      expect(screen.getByText('Zaznacz przy każdym celu, czy został dowieziony.')).toBeTruthy(),
    );
    expect(submitEvening).not.toHaveBeenCalled();
  });

  it('komplet wyborów → submitEvening z id celów z dnia, onClosed', async () => {
    const closed = { ...pendingDay(), status: 'closed' as const };
    submitEvening.mockResolvedValue(closed);
    const user = userEvent.setup();
    const { onClosed } = renderForm();
    await markAllDone(user);
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));

    await waitFor(() => expect(submitEvening).toHaveBeenCalledTimes(1));
    // KLUCZOWE: id celów pochodzą z dnia, dokładnie 3, w kolejności główny → poboczne.
    expect(submitEvening).toHaveBeenCalledWith({
      goals: [
        { id: 'g-main', completed: true },
        { id: 'g-s1', completed: true },
        { id: 'g-s2', completed: true },
      ],
    });
    expect(onClosed).toHaveBeenCalledWith(closed);
  });

  it('409 DAY_ALREADY_CLOSED → onConflict (nie pokazuje błędu)', async () => {
    submitEvening.mockRejectedValue(new ApiRequestError('Zamknięty', 409, 'DAY_ALREADY_CLOSED'));
    const user = userEvent.setup();
    const { onConflict } = renderForm();
    await markAllDone(user);
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));

    await waitFor(() => expect(onConflict).toHaveBeenCalledWith('DAY_ALREADY_CLOSED'));
  });

  it('400 GOAL_MISMATCH → onConflict', async () => {
    submitEvening.mockRejectedValue(new ApiRequestError('Niezgodne', 400, 'GOAL_MISMATCH'));
    const user = userEvent.setup();
    const { onConflict } = renderForm();
    await markAllDone(user);
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));

    await waitFor(() => expect(onConflict).toHaveBeenCalledWith('GOAL_MISMATCH'));
  });

  it('inny błąd API → komunikat w form-error, przycisk znów aktywny', async () => {
    submitEvening.mockRejectedValue(new ApiRequestError('Serwer padł', 500));
    const user = userEvent.setup();
    renderForm();
    await markAllDone(user);
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));

    await waitFor(() => expect(screen.getByText('Serwer padł')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Zamknij dzień' })).toHaveProperty('disabled', false);
  });
});
