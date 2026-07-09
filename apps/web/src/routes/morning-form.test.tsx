import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/api';
import { MorningForm } from './morning-form';

// Mockujemy tylko createDay z klienta API (ApiRequestError zostaje realny — testujemy 409 po code).
const createDay = vi.fn();
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, createDay: (...a: unknown[]) => createDay(...a) as unknown };
});

function renderForm(overrides?: { onCreated?: () => void; onDayAlreadyExists?: () => void }) {
  const onCreated = vi.fn(overrides?.onCreated);
  const onDayAlreadyExists = vi.fn(overrides?.onDayAlreadyExists);
  render(<MorningForm onCreated={onCreated} onDayAlreadyExists={onDayAlreadyExists} />);
  return { onCreated, onDayAlreadyExists };
}

async function fillValid(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Tytuł', { selector: '#main-title' }), 'Główny');
  await user.type(screen.getByLabelText('Tytuł', { selector: '#sec-0-title' }), 'Poboczny 1');
  await user.type(screen.getByLabelText('Tytuł', { selector: '#sec-1-title' }), 'Poboczny 2');
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('MorningForm (FE-7)', () => {
  it('walidacja: puste tytuły → komunikaty, brak wywołania API', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));
    // Zod min(1) na main.title i secondary[*].title — komunikaty pod polami.
    await waitFor(() =>
      expect(screen.getByLabelText('Tytuł', { selector: '#main-title' })).toHaveProperty(
        'ariaInvalid',
        'true',
      ),
    );
    expect(createDay).not.toHaveBeenCalled();
  });

  it('poprawne dane → POST createDay, onCreated z utworzonym dniem', async () => {
    const day = {
      id: 'd1',
      date: '2026-07-09',
      status: 'evening_pending' as const,
      morningNote: null,
      eveningNote: null,
      goals: [],
    };
    createDay.mockResolvedValue(day);
    const user = userEvent.setup();
    const { onCreated } = renderForm();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));

    await waitFor(() => expect(createDay).toHaveBeenCalledTimes(1));
    expect(createDay).toHaveBeenCalledWith(
      expect.objectContaining({
        main: expect.objectContaining({ title: 'Główny' }),
        secondary: expect.arrayContaining([expect.objectContaining({ title: 'Poboczny 1' })]),
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(day);
  });

  it('409 DAY_ALREADY_EXISTS → onDayAlreadyExists (nie pokazuje błędu)', async () => {
    createDay.mockRejectedValue(new ApiRequestError('Dzień już istnieje', 409, 'DAY_ALREADY_EXISTS'));
    const user = userEvent.setup();
    const { onDayAlreadyExists } = renderForm();
    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));

    await waitFor(() => expect(onDayAlreadyExists).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('notatka >2000 znaków → widoczny komunikat błędu, brak wywołania API', async () => {
    const user = userEvent.setup();
    renderForm();
    await fillValid(user);
    // maxLength blokuje wpisanie z klawiatury — wymuszamy zbyt długą wartość programowo
    // (symulacja wklejenia), by wywołać issue zod `.max(2000)` niezmapowany na żadne pole.
    fireEvent.change(screen.getByLabelText('Notatka poranna (opcjonalnie)'), {
      target: { value: 'x'.repeat(2001) },
    });
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));

    // Fallback: przy braku mapowania na pole użytkownik dostaje komunikat w form-error (role=alert).
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(createDay).not.toHaveBeenCalled();
  });

  it('inny błąd API → komunikat w form-error, przycisk znów aktywny', async () => {
    createDay.mockRejectedValue(new ApiRequestError('Serwer padł', 500));
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Tytuł', { selector: '#main-title' }), 'Główny');
    await user.type(screen.getByLabelText('Tytuł', { selector: '#sec-0-title' }), 'P1');
    await user.type(screen.getByLabelText('Tytuł', { selector: '#sec-1-title' }), 'P2');
    await user.click(screen.getByRole('button', { name: 'Zapisz poranek' }));

    await waitFor(() => expect(screen.getByText('Serwer padł')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Zapisz poranek' })).toHaveProperty('disabled', false);
  });
});
