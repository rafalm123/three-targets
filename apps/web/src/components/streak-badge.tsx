import type { Streak } from '@trzy-cele/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { getStreak } from '../lib/api';
import { useStreakRefresh } from './streak-refresh';

/**
 * Wskaźnik serii (FE-11) w nagłówku — widoczny na obu trasach za loginem. Pobiera `getStreak`
 * NIEZALEŻNIE od reszty ekranu i **degraduje miękko**: podczas ładowania i przy błędzie renderuje
 * `null` (nie pokazujemy błędu ani spinnera w chrome — brak serii nie może wywalić widoku dnia/
 * historii). Pokazuje `current` (płomień), a `longest`/`totalDays` w tytule/aria dla kontekstu.
 *
 * SEMANTYKA SERII (zmiana kontraktu BE): seria liczy kolejne dni, w których dowieziono CEL GŁÓWNY
 * (`main.completed === true`) — cele poboczne bez znaczenia, a dzień zamknięty bez głównego zrywa
 * serię. Copy poniżej celowo mówi „dni z dowiezionym celem głównym", nie „dni zamknięte", żeby nie
 * sugerować, że nagrodą jest samo domknięcie wieczoru.
 *
 * Re-fetchuje, gdy `refreshKey` z `useStreakRefresh` się zmieni (po zamknięciu dnia / resecie serii
 * — CR NIT-1), żeby licznik zmieniał się od razu w momencie nagrody/resetu, bez czekania na nawigację.
 */
export function StreakBadge(): ReactNode {
  const [streak, setStreak] = useState<Streak | null>(null);
  const { refreshKey } = useStreakRefresh();

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
  }, [refreshKey]);

  if (!streak) return null;

  const title = `Seria: ${streak.current} ${dayWord(streak.current)} z rzędu z dowiezionym celem głównym (rekord: ${streak.longest}, łącznie dni z celem: ${streak.totalDays})`;

  return (
    <span className="streak-badge" title={title} aria-label={title}>
      <span aria-hidden="true">🔥</span>
      <strong>{streak.current}</strong>
    </span>
  );
}

/**
 * Polska odmiana słowa „dzień" dla licznika (CR NIT-2). W przeciwieństwie do „cel/cele" forma
 * mnoga jest jedna: 1 → „dzień"; każda inna liczba (2, 3, 4, 5, 11, 22…) → „dni". `current` jest
 * nieujemne, więc nie obsługujemy przypadków < 0.
 */
function dayWord(n: number): string {
  return n === 1 ? 'dzień' : 'dni';
}
