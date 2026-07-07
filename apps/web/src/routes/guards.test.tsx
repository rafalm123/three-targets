import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtectedRoute, PublicOnlyRoute } from './guards';

// Mockujemy hook sesji — testujemy logikę guardów niezależnie od Better Auth i sieci.
const useSessionMock = vi.fn();
vi.mock('../lib/auth-client', () => ({
  useSession: () => useSessionMock() as unknown,
}));

interface SessionState {
  data: unknown;
  isPending: boolean;
  error: unknown;
  refetch: () => Promise<void>;
}

function session(partial: Partial<SessionState>): SessionState {
  return { data: null, isPending: false, error: null, refetch: vi.fn(), ...partial };
}

/** Renderuje ProtectedRoute owijające trasę „app" pod `/`, ze startem na wskazanej ścieżce. */
function renderProtected(initialPath = '/'): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>APP</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderPublicOnly(state?: { from?: string }): void {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<div>LOGIN</div>} />
        </Route>
        <Route path="/" element={<div>APP</div>} />
        <Route path="/rano" element={<div>RANO</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('ProtectedRoute', () => {
  it('podczas isPending pokazuje Loading (nie wyrzuca zalogowanego przy odświeżeniu)', () => {
    useSessionMock.mockReturnValue(session({ isPending: true }));
    renderProtected();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('LOGIN')).toBeNull();
    expect(screen.queryByText('APP')).toBeNull();
  });

  it('brak sesji → przekierowanie na /login', () => {
    useSessionMock.mockReturnValue(session({ data: null }));
    renderProtected();
    expect(screen.getByText('LOGIN')).toBeTruthy();
  });

  it('sesja obecna → renderuje trasę potomną', () => {
    useSessionMock.mockReturnValue(session({ data: { user: { id: '1' } } }));
    renderProtected();
    expect(screen.getByText('APP')).toBeTruthy();
  });

  it('błąd sesji → ErrorState (nie biały ekran, nie zakłada zalogowania)', () => {
    useSessionMock.mockReturnValue(session({ error: new Error('offline') }));
    renderProtected();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('APP')).toBeNull();
  });
});

describe('PublicOnlyRoute', () => {
  it('gość → renderuje login', () => {
    useSessionMock.mockReturnValue(session({ data: null }));
    renderPublicOnly();
    expect(screen.getByText('LOGIN')).toBeTruthy();
  });

  it('zalogowany bez zapamiętanej ścieżki → /', () => {
    useSessionMock.mockReturnValue(session({ data: { user: { id: '1' } } }));
    renderPublicOnly();
    expect(screen.getByText('APP')).toBeTruthy();
  });

  it('zalogowany z zapamiętaną ścieżką → wraca na nią', () => {
    useSessionMock.mockReturnValue(session({ data: { user: { id: '1' } } }));
    renderPublicOnly({ from: '/rano' });
    expect(screen.getByText('RANO')).toBeTruthy();
  });
});
