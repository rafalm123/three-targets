import type { ReactNode } from 'react';

/**
 * Reużywalne globalne stany UI (FE-5): Loading / Error / Empty.
 *
 * Obrona przed „białym ekranem śmierci": każdy widok pobierający dane powinien renderować
 * jeden z tych stanów zamiast pustego ekranu. Spójny wygląd w całej apce.
 */

/** Stan ładowania — spinner + opcjonalna etykieta. `role=status` ogłasza go czytnikom ekranu. */
export function LoadingState({ label = 'Ładowanie…' }: { label?: string }): ReactNode {
  return (
    <div className="state" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Stan błędu — komunikat + opcjonalna akcja „spróbuj ponownie". `role=alert` dla a11y. */
export function ErrorState({
  title = 'Coś poszło nie tak',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <div className="state" role="alert">
      <span className="state-title">{title}</span>
      {message ? <span>{message}</span> : null}
      {onRetry ? (
        <button type="button" className="button button-secondary" onClick={onRetry}>
          Spróbuj ponownie
        </button>
      ) : null}
    </div>
  );
}

/** Stan pusty — brak danych do pokazania (np. pusta historia). */
export function EmptyState({
  title = 'Brak danych',
  message,
  children,
}: {
  title?: string;
  message?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className="state">
      <span className="state-title">{title}</span>
      {message ? <span>{message}</span> : null}
      {children}
    </div>
  );
}
