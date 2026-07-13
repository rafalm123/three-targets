import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChallengePage } from './routes/challenge-page';
import { HistoryDayPage } from './routes/history-day-page';
import { HistoryPage } from './routes/history-page';
import { LoginPage } from './routes/login-page';
import { RegisterPage } from './routes/register-page';
import { TodayPage } from './routes/today-page';
import { ProtectedRoute, PublicOnlyRoute } from './routes/guards';

/**
 * Korzeń aplikacji + routing (FE-4).
 *
 * Struktura tras:
 *  - `/login`, `/register` — tylko dla gościa (PublicOnlyRoute); zalogowany → `/`.
 *  - `/` (Dziś, HUB), `/historia` (lista) i `/historia/:date` (szczegół dnia, FE-13) — chronione
 *    (ProtectedRoute); gość → `/login`. Odświeżenie nie wylogowuje (sesja w ciasteczku HttpOnly,
 *    `useSession` re-hydratuje stan); szczegół dnia odtwarza się z param trasy (refresh/deep-link).
 *  - `*` — nieznana ścieżka → `/` (guard i tak rozstrzygnie login vs apka).
 *
 * Konwencja: każdy ekran sam owija się w `AppShell` (spójnie w całej apce), routing nie
 * dokłada chrome'u — dzięki temu ekran ma pełną kontrolę nad nagłówkiem (np. akcje).
 */
export function App(): ReactNode {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<TodayPage />} />
          <Route path="/cele" element={<ChallengePage />} />
          <Route path="/historia" element={<HistoryPage />} />
          <Route path="/historia/:date" element={<HistoryDayPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
