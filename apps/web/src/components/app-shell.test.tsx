import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';

// StreakBadge i LogoutButton mają własne testy — tu podmieniamy na markery, by sprawdzić że
// AppShell dokłada globalny chrome (logout/streak/nav) na trasach za loginem.
vi.mock('./streak-badge', () => ({ StreakBadge: () => <span>STREAK</span> }));
vi.mock('./logout-button', () => ({ LogoutButton: () => <span>LOGOUT</span> }));

function renderShell(showNav: boolean, path = '/'): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell showNav={showNav}>
        <p>CONTENT</p>
      </AppShell>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AppShell (FE-6/FE-11/FE-12)', () => {
  it('bez showNav (ekrany auth): brak nawigacji, logoutu i streaka', () => {
    renderShell(false);
    expect(screen.getByText('CONTENT')).toBeTruthy();
    expect(screen.queryByText('LOGOUT')).toBeNull();
    expect(screen.queryByText('STREAK')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('showNav: logout + streak + nawigacja obecne (trasa „Dziś")', () => {
    renderShell(true, '/');
    expect(screen.getByText('LOGOUT')).toBeTruthy();
    expect(screen.getByText('STREAK')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dziś' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Historia' })).toBeTruthy();
  });

  it('logout dostępny także na trasie „Historia" (nie tylko „Dziś")', () => {
    renderShell(true, '/historia');
    expect(screen.getByText('LOGOUT')).toBeTruthy();
  });
});
