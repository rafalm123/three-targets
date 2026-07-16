import type { Goal } from '@trzy-cele/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoalMarkRow } from './goal-mark-row';

function mainGoal(overrides?: Partial<Goal>): Goal {
  return {
    id: 'g-main',
    kind: 'main',
    position: 0,
    title: 'Główny',
    note: null,
    completed: null,
    completedNote: null,
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe('GoalMarkRow (oznaczanie per-cel)', () => {
  it('wybór „Dowiezione" zapisuje NATYCHMIAST przez onMark', async () => {
    const onMark = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<GoalMarkRow goal={mainGoal()} index={0} onMark={onMark} />);

    await user.click(screen.getByRole('radio', { name: 'Dowiezione' }));
    await waitFor(() => expect(onMark).toHaveBeenCalledWith('g-main', { completed: true }));
  });

  it('wybór z wpisaną notatką → completedNote w patchu', async () => {
    const onMark = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<GoalMarkRow goal={mainGoal()} index={0} onMark={onMark} />);

    await user.type(screen.getByLabelText('Notatka (opcjonalnie)'), '  szło  ');
    await user.click(screen.getByRole('radio', { name: 'Niedowiezione' }));
    await waitFor(() =>
      expect(onMark).toHaveBeenCalledWith('g-main', { completed: false, completedNote: 'szło' }),
    );
  });

  it('„Zapisz notatkę" nieaktywne dopóki brak wyboru completed', async () => {
    const onMark = vi.fn().mockResolvedValue(undefined);
    render(<GoalMarkRow goal={mainGoal()} index={0} onMark={onMark} />);
    expect(screen.getByRole('button', { name: 'Zapisz notatkę' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Wybierz najpierw, czy cel został dowieziony.')).toBeTruthy();
  });

  it('prefill z celu: completed=true → radio zaznaczone, „Zapisz notatkę" aktywne', () => {
    const onMark = vi.fn().mockResolvedValue(undefined);
    render(
      <GoalMarkRow
        goal={mainGoal({ completed: true, completedNote: 'ok' })}
        index={0}
        onMark={onMark}
      />,
    );
    expect((screen.getByRole('radio', { name: 'Dowiezione' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: 'Zapisz notatkę' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('błąd zapisu → komunikat inline', async () => {
    const onMark = vi.fn().mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<GoalMarkRow goal={mainGoal()} index={0} onMark={onMark} />);

    await user.click(screen.getByRole('radio', { name: 'Dowiezione' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Nie udało się zapisać. Spróbuj ponownie.')).toBeTruthy();
  });

  it('błąd zapisu → rollback optymistycznego wyboru do poprzedniej wartości', async () => {
    const onMark = vi.fn().mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<GoalMarkRow goal={mainGoal({ completed: true })} index={0} onMark={onMark} />);

    const dowiezione = screen.getByRole('radio', { name: 'Dowiezione' }) as HTMLInputElement;
    const niedowiezione = screen.getByRole('radio', { name: 'Niedowiezione' }) as HTMLInputElement;
    expect(dowiezione.checked).toBe(true);

    await user.click(niedowiezione);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    await waitFor(() => expect(dowiezione.checked).toBe(true));
    expect(niedowiezione.checked).toBe(false);
  });
});
