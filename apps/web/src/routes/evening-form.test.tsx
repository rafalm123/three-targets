import type { Day } from '@trzy-cele/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/api';
import { EveningForm } from './evening-form';

// submitEvening mockowany; ApiRequestError realny (testujemy 403/409/400 po code).
const submitEvening = vi.fn();
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, submitEvening: (...a: unknown[]) => submitEvening(...a) as unknown };
});

/** Dzień z częścią celów już oznaczonych per-cel (główny+B), poboczny A jeszcze nieoznaczony. */
function partiallyMarkedDay(): Day {
  return {
    id: 'd1',
    date: '2026-07-09',
    status: 'evening_pending',
    morningNote: null,
    eveningNote: null,
    goals: [
      {
        id: 'g-main',
        kind: 'main',
        position: 0,
        title: 'Główny',
        note: null,
        completed: true,
        completedNote: 'główny szło',
      },
      {
        id: 'g-s1',
        kind: 'secondary',
        position: 1,
        title: 'Poboczny A',
        note: null,
        completed: null,
        completedNote: null,
      },
      {
        id: 'g-s2',
        kind: 'secondary',
        position: 2,
        title: 'Poboczny B',
        note: null,
        completed: false,
        completedNote: null,
      },
    ],
  };
}

/** Dzień zamknięty z pełnymi danymi (re-submit — FE-B): wszystkie cele oznaczone + eveningNote. */
function closedDay(): Day {
  return {
    ...partiallyMarkedDay(),
    status: 'closed',
    eveningNote: 'stara notatka wieczorna',
    goals: partiallyMarkedDay().goals.map((g) => ({
      ...g,
      completed: g.id === 'g-s1' ? false : g.completed,
    })),
  };
}

function renderForm(overrides?: { onClosed?: () => void; onConflict?: () => void; day?: Day }) {
  const onClosed = vi.fn(overrides?.onClosed);
  const onConflict = vi.fn(overrides?.onConflict);
  render(
    <EveningForm
      day={overrides?.day ?? partiallyMarkedDay()}
      onClosed={onClosed}
      onConflict={onConflict}
    />,
  );
  return { onClosed, onConflict };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('EveningForm (domknięcie dnia)', () => {
  it('przycisk „Zamknij dzień" aktywny od razu — brak bramki kompletu', () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Zamknij dzień' })).toHaveProperty('disabled', false);
    expect(screen.queryByText(/Oceń jeszcze/)).toBeNull();
  });

  it('wysyła PODZBIÓR już oznaczonych celów z datą dnia + eveningNote; pomija nieoznaczone', async () => {
    submitEvening.mockResolvedValue({ ...partiallyMarkedDay(), status: 'closed' });
    const user = userEvent.setup();
    const { onClosed } = renderForm();

    await user.type(screen.getByLabelText('Notatka wieczorna (opcjonalnie)'), '  podsumowanie  ');
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));

    await waitFor(() => expect(submitEvening).toHaveBeenCalledTimes(1));
    // Poboczny A (completed=null) pominięty; główny+B przekazane z ich completed/completedNote.
    expect(submitEvening).toHaveBeenCalledWith('2026-07-09', {
      goals: [
        { id: 'g-main', completed: true, completedNote: 'główny szło' },
        { id: 'g-s2', completed: false },
      ],
      eveningNote: 'podsumowanie',
    });
    expect(onClosed).toHaveBeenCalled();
  });

  it('re-submit (dzień closed): wszystkie oznaczone → podzbiór 3, zachowuje eveningNote z prefillu', async () => {
    submitEvening.mockResolvedValue(closedDay());
    const user = userEvent.setup();
    renderForm({ day: closedDay() });

    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));

    await waitFor(() => expect(submitEvening).toHaveBeenCalledTimes(1));
    expect(submitEvening).toHaveBeenCalledWith('2026-07-09', {
      goals: [
        { id: 'g-main', completed: true, completedNote: 'główny szło' },
        { id: 'g-s1', completed: false },
        { id: 'g-s2', completed: false },
      ],
      eveningNote: 'stara notatka wieczorna',
    });
  });

  it('403 DAY_FROZEN → onConflict (nie pokazuje błędu)', async () => {
    submitEvening.mockRejectedValue(new ApiRequestError('Zamrożony', 403, 'DAY_FROZEN'));
    const user = userEvent.setup();
    const { onConflict } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));
    await waitFor(() => expect(onConflict).toHaveBeenCalledWith('DAY_FROZEN'));
  });

  it('400 GOAL_NOT_IN_DAY → onConflict', async () => {
    submitEvening.mockRejectedValue(new ApiRequestError('Spoza dnia', 400, 'GOAL_NOT_IN_DAY'));
    const user = userEvent.setup();
    const { onConflict } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));
    await waitFor(() => expect(onConflict).toHaveBeenCalledWith('GOAL_NOT_IN_DAY'));
  });

  it('inny błąd API → komunikat w form-error, przycisk znów aktywny', async () => {
    submitEvening.mockRejectedValue(new ApiRequestError('Serwer padł', 500));
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));

    await waitFor(() => expect(screen.getByText('Serwer padł')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Zamknij dzień' })).toHaveProperty('disabled', false);
  });
});
