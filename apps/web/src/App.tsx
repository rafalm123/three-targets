import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/app-shell';
import { HomePage } from './routes/home-page';
import { LoginPage } from './routes/login-page';
import { RegisterPage } from './routes/register-page';
import { ProtectedRoute, PublicOnlyRoute } from './routes/guards';

/**
 * Korzeń aplikacji + routing (FE-4).
 *
 * Struktura tras:
 *  - `/login`, `/register` — tylko dla gościa (PublicOnlyRoute); zalogowany → `/`.
 *  - `/` — chroniona (ProtectedRoute); gość → `/login`. Odświeżenie nie wylogowuje
 *    (sesja w ciasteczku HttpOnly, `useSession` re-hydratuje stan).
 *  - `*` — nieznana ścieżka → `/` (guard i tak rozstrzygnie login vs apka).
 */
export function App(): ReactNode {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route
            path="/login"
            element={
              <AppShell>
                <LoginPage />
              </AppShell>
            }
          />
          <Route
            path="/register"
            element={
              <AppShell>
                <RegisterPage />
              </AppShell>
            }
          />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
