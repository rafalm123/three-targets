import type { Streak } from '@trzy-cele/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { getStreak } from '../lib/api';

/**
 * Wskaźnik serii (FE-11) w nagłówku — widoczny na obu trasach za loginem. Pobiera `getStreak`
 * NIEZALEŻNIE od reszty ekranu i **degraduje miękko**: podczas ładowania i przy błędzie renderuje
 * `null` (nie pokazujemy błędu ani spinnera w chrome — brak serii nie może wywalić widoku dnia/
 * historii). Pokazuje `current` (płomień), a `longest`/`totalDays` w tytule/aria dla kontekstu.
 */
export function StreakBadge(): ReactNode {
  const [streak, setStreak] = useState<Streak | null>(null);

  useEffect(() => {
    let active = true;
    // Miękka degradacja: jakikolwiek błąd (sieć/HTTP/kontrakt) → po prostu nie pokazujemy badge.
    getStreak()
      .then((s) => {
        if (active) setStreak(s);
      })
      .catch(() => {
        /* celowo cicho — brak wskaźnika serii nie może zepsuć reszty ekranu */
      });
    return () => {
      active = false;
    };
  }, []);

  if (!streak) return null;

  const title = `Seria: ${streak.current} dni (rekord: ${streak.longest}, łącznie zamkniętych: ${streak.totalDays})`;

  return (
    <span className="streak-badge" title={title} aria-label={title}>
      <span aria-hidden="true">🔥</span>
      <strong>{streak.current}</strong>
    </span>
  );
}
