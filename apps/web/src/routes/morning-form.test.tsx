import type { Day } from '@trzy-cele/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/api';
import { MorningForm } from './morning-form';

// createDay to domyślny onSubmit MorningForm — mockujemy je, ApiRequestError zostaje realny.
const createDay = vi.fn();
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, createDay: (...a: unknown[]) => createDay(...a) as unknown };
});

function renderCreate(overrides?: { onSuccess?: () => void; onConflict?: () => void }) {
  const onSuccess = vi.fn(overrides?.onSuccess);
  const onConflict = vi.fn(overrides?.onConflict);
  render(<MorningForm onSuccess={onSuccess} onConflict={onConflict} />);
  return { onSuccess, onConflict };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Tytuł', { selector: '#main-title' }), 'Główny');
  await user.type(screen.getByLabelText('Tytuł', { selector: '#sec-0-title' }), 'Poboczny 1');
  await user.type(screen.getByLabelText('Tytuł', { selector: '#sec-1-title' }), 'Poboczny 2');
}

function existingDay(): Day {
  return {
    id: 'd1',
    date: '2026-07-09',
    status: 'evening_pending',
    morningNote: 'stara notatka',
    eveningNote: null,
    goals: [
      { id: 'g0', kind: 'main', position: 0, title: 'Stary główny', note: 'nn', completed: null, completedNote: null },
      { id: 'g1', kind: 'secondary', position: 1, title: 'Stary A', note: null, completed: null, completedNote: null },
      { id: 'g2', kind: 'secondary', position: 2, title: 'Stary B', note: null, completed: null, completedNote: null },
    ],
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('MorningForm — tryb tworzenia (FE-7)', () => {
  it('walidacja: puste tytuły → komunikaty, brak wywołania API', async () => {
    const user = userEvent.setup();
    renderCreate();
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Tytuł', { selector: '#main-title' })).toHaveProperty(
        'ariaInvalid',
        'true',
      ),
    );
    expect(createDay).not.toHaveBeenCalled();
  });

  it('poprawne dane → createDay, onSuccess z utworzonym dniem', async () => {
    const day = existingDay();
    createDay.mockResolvedValue(day);
    const user = userEvent.setup();
    const { onSuccess } = renderCreate();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));

    await waitFor(() => expect(createDay).toHaveBeenCalledTimes(1));
    expect(createDay).toHaveBeenCalledWith(
      expect.objectContaining({
        main: expect.objectContaining({ title: 'Główny' }),
        secondary: expect.arrayContaining([expect.objectContaining({ title: 'Poboczny 1' })]),
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith(day);
  });

  it('409 DAY_ALREADY_EXISTS → onConflict (nie pokazuje błędu)', async () => {
    createDay.mockRejectedValue(new ApiRequestError('Dzień już istnieje', 409, 'DAY_ALREADY_EXISTS'));
    const user = userEvent.setup();
    const { onConflict } = renderCreate();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));

    await waitFor(() => expect(onConflict).toHaveBeenCalledWith('DAY_ALREADY_EXISTS'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('notatka >2000 znaków → widoczny komunikat błędu, brak wywołania API', async () => {
    const user = userEvent.setup();
    renderCreate();
    await fillValid(user);
    // maxLength blokuje wpisanie z klawiatury — wymuszamy zbyt długą wartość programowo
    // (symulacja wklejenia), by wywołać issue zod `.max(2000)` niezmapowany na żadne pole.
    fireEvent.change(screen.getByLabelText('Notatka poranna (opcjonalnie)'), {
      target: { value: 'x'.repeat(2001) },
    });
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(createDay).not.toHaveBeenCalled();
  });

  it('inny błąd API → komunikat w form-error, przycisk znów aktywny', async () => {
    createDay.mockRejectedValue(new ApiRequestError('Serwer padł', 500));
    const user = userEvent.setup();
    renderCreate();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));

    await waitFor(() => expect(screen.getByText('Serwer padł')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Zapisz poranek' })).toHaveProperty('disabled', false);
  });
});

describe('MorningForm — tryb edycji (BE-11)', () => {
  it('prefill z initialDay + PATCH (pełne zastąpienie) → onSuccess', async () => {
    const day = existingDay();
    const updateMorning = vi.fn().mockResolvedValue({ ...day, morningNote: 'nowa notatka' });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <MorningForm
        initialDay={day}
        heading="Edytuj poranek"
        submitLabel="Zapisz zmiany"
        onSubmit={updateMorning}
        onSuccess={onSuccess}
      />,
    );

    // Prefill: pola mają wartości z dnia.
    const mainTitle = screen.getByLabelText('Tytuł', { selector: '#main-title' });
    expect(mainTitle).toHaveProperty('value', 'Stary główny');
    expect(screen.getByLabelText('Notatka poranna (opcjonalnie)')).toHaveProperty(
      'value',
      'stara notatka',
    );

    // Zmiana głównego tytułu i zapis.
    await user.clear(mainTitle);
    await user.type(mainTitle, 'Nowy główny');
    await user.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    await waitFor(() => expect(updateMorning).toHaveBeenCalledTimes(1));
    // Pełny komplet 3 celów + morningNote (semantyka replace) trafia do PATCH.
    expect(updateMorning).toHaveBeenCalledWith(
      expect.objectContaining({
        main: expect.objectContaining({ title: 'Nowy główny' }),
        secondary: [
          expect.objectContaining({ title: 'Stary A' }),
          expect.objectContaining({ title: 'Stary B' }),
        ],
        morningNote: 'stara notatka',
      }),
    );
    expect(createDay).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('409 DAY_ALREADY_CLOSED w edycji → onConflict', async () => {
    const day = existingDay();
    const updateMorning = vi
      .fn()
      .mockRejectedValue(new ApiRequestError('Zamknięty', 409, 'DAY_ALREADY_CLOSED'));
    const onConflict = vi.fn();
    const user = userEvent.setup();
    render(
      <MorningForm
        initialDay={day}
        submitLabel="Zapisz zmiany"
        onSubmit={updateMorning}
        onSuccess={vi.fn()}
        onConflict={onConflict}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Zapisz zmiany' }));

    await waitFor(() => expect(onConflict).toHaveBeenCalledWith('DAY_ALREADY_CLOSED'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Anuluj wywołuje onCancel', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <MorningForm initialDay={existingDay()} onSubmit={vi.fn()} onSuccess={vi.fn()} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole('button', { name: 'Anuluj' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
