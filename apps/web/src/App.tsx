import { healthResponseSchema } from '@trzy-cele/shared';
import { useEffect, useState } from 'react';

type ApiStatus = 'loading' | 'ok' | 'error';

/**
 * Szkielet SPA (FE-1). Sprawdza łączność z API przez GET /api/health i waliduje
 * odpowiedź kontraktem z `@trzy-cele/shared` — pierwszy dowód, że ten sam kontrakt
 * spina frontend i backend. Layout, routing i widoki dochodzą w kolejnych taskach FE.
 */
export function App() {
  const [status, setStatus] = useState<ApiStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => healthResponseSchema.parse(data))
      .then(() => {
        if (!cancelled) setStatus('ok');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const label = status === 'loading' ? '…' : status === 'ok' ? '✅ ok' : '❌ błąd';

  return (
    <main>
      <h1>Trzy Cele</h1>
      <p>Status API: {label}</p>
    </main>
  );
}
