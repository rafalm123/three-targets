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
      {
        id: 'g-main',
        kind: 'main',
        position: 0,
        title: 'Główny',
        note: null,
        completed: null,
        completedNote: null,
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
        completed: null,
        completedNote: null,
      },
    ],
  };
}

/**
 * Dzień już zamknięty z pełnymi danymi wieczoru (re-submit — FE-B): każdy cel ma `completed` i
 * niektóre `completedNote`, jest też `eveningNote`. Służy do testu, że re-submit NIE gubi danych.
 */
function closedDay(): Day {
  return {
    id: 'd1',
    date: '2026-07-09',
    status: 'closed',
    morningNote: null,
    eveningNote: 'stara notatka wieczorna',
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
        completed: false,
        completedNote: null,
      },
      {
        id: 'g-s2',
        kind: 'secondary',
        position: 2,
        title: 'Poboczny B',
        note: null,
        completed: true,
        completedNote: 'poboczny B ok',
      },
    ],
  };
}

function renderForm(overrides?: { onClosed?: () => void; onConflict?: () => void; day?: Day }) {
  const onClosed = vi.fn(overrides?.onClosed);
  const onConflict = vi.fn(overrides?.onConflict);
  render(
    <EveningForm
      day={overrides?.day ?? pendingDay()}
      onClosed={onClosed}
      onConflict={onConflict}
    />,
  );
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

  it('dopóki nie wszystkie cele ocenione → przycisk disabled + licznik ile zostało', async () => {
    const user = userEvent.setup();
    renderForm();
    const submit = screen.getByRole('button', { name: 'Zamknij dzień' });
    // Start: 3 cele nieocenione — disabled + „Oceń jeszcze 3 cele".
    expect(submit).toHaveProperty('disabled', true);
    expect(screen.getByText('Oceń jeszcze 3 cele, aby zamknąć dzień.')).toBeTruthy();

    // Oceń jeden → licznik spada do 2, wciąż disabled.
    await user.click(screen.getAllByRole('radio', { name: 'Dowiezione' })[0]!);
    expect(screen.getByText('Oceń jeszcze 2 cele, aby zamknąć dzień.')).toBeTruthy();
    expect(submit).toHaveProperty('disabled', true);

    // Oceń drugi → licznik „1 cel" (odmiana), wciąż disabled.
    await user.click(screen.getAllByRole('radio', { name: 'Niedowiezione' })[1]!);
    expect(screen.getByText('Oceń jeszcze 1 cel, aby zamknąć dzień.')).toBeTruthy();
    expect(submit).toHaveProperty('disabled', true);

    // Oceń trzeci → licznik znika, przycisk aktywny.
    await user.click(screen.getAllByRole('radio', { name: 'Dowiezione' })[2]!);
    expect(screen.queryByText(/Oceń jeszcze/)).toBeNull();
    expect(submit).toHaveProperty('disabled', false);
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

  it('notatki celów i wieczorna po trim trafiają do payloadu', async () => {
    const closed = { ...pendingDay(), status: 'closed' as const };
    submitEvening.mockResolvedValue(closed);
    const user = userEvent.setup();
    renderForm();
    await markAllDone(user);

    // completedNote dla pierwszego celu (główny) + eveningNote — z otaczającymi spacjami.
    const noteInputs = screen.getAllByLabelText('Notatka (opcjonalnie)');
    await user.type(noteInputs[0]!, '  szło dobrze  ');
    await user.type(screen.getByLabelText('Notatka wieczorna (opcjonalnie)'), '  podsumowanie  ');
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));

    await waitFor(() => expect(submitEvening).toHaveBeenCalledTimes(1));
    expect(submitEvening).toHaveBeenCalledWith({
      goals: [
        { id: 'g-main', completed: true, completedNote: 'szło dobrze' },
        { id: 'g-s1', completed: true },
        { id: 'g-s2', completed: true },
      ],
      eveningNote: 'podsumowanie',
    });
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

  it('re-submit (dzień closed): prefill z dnia — submit od razu aktywny, brak licznika', () => {
    renderForm({ day: closedDay() });
    // Wszystkie 3 cele mają już `completed` z dnia → remaining===0 → przycisk aktywny bez klikania.
    expect(screen.getByRole('button', { name: 'Zamknij dzień' })).toHaveProperty('disabled', false);
    expect(screen.queryByText(/Oceń jeszcze/)).toBeNull();
    // Radio odzwierciedla zapisany stan: główny dowieziony, poboczny A niedowieziony.
    const done = screen.getAllByRole('radio', { name: 'Dowiezione' });
    const notDone = screen.getAllByRole('radio', { name: 'Niedowiezione' });
    expect((done[0] as HTMLInputElement).checked).toBe(true);
    expect((notDone[1] as HTMLInputElement).checked).toBe(true);
    expect((done[2] as HTMLInputElement).checked).toBe(true);
  });

  it('re-submit: poprawa JEDNEGO celu nie gubi pozostałych danych (notatki/eveningNote z prefillu)', async () => {
    const closed = closedDay();
    submitEvening.mockResolvedValue(closed);
    const user = userEvent.setup();
    renderForm({ day: closed });

    // Poprawiamy tylko poboczny A: było „Niedowiezione" → zmieniamy na „Dowiezione". Reszta nietknięta.
    await user.click(screen.getAllByRole('radio', { name: 'Dowiezione' })[1]!);
    await user.click(screen.getByRole('button', { name: 'Zamknij dzień' }));

    await waitFor(() => expect(submitEvening).toHaveBeenCalledTimes(1));
    // KLUCZOWE (B1): payload zachowuje `completedNote` głównego i poboczny B oraz `eveningNote` z
    // prefillu — mimo że BE robi pełne zastąpienie, nie nadpisujemy ich nullem.
    expect(submitEvening).toHaveBeenCalledWith({
      goals: [
        { id: 'g-main', completed: true, completedNote: 'główny szło' },
        { id: 'g-s1', completed: true },
        { id: 'g-s2', completed: true, completedNote: 'poboczny B ok' },
      ],
      eveningNote: 'stara notatka wieczorna',
    });
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
