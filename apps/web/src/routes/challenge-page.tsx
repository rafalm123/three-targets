import type { ChallengeSummary, ChallengeWithPoints, RewardTierState } from '@trzy-cele/shared';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppShell } from '../components/app-shell';
import { EmptyState, ErrorState, LoadingState } from '../components/states';
import { getActiveChallenge, listChallenges } from '../lib/api';
import { ChallengeCreateForm } from './challenge-create-form';
import { formatDate } from './history-format';

/**
 * Zakładka „Lista celów" (FE-P2/P3) — trasa `/cele`. HUB pobiera aktywne wyzwanie
 * (`getActiveChallenge`) i kieruje:
 *  - `challenge === null` → ekran „Utwórz listę" (`ChallengeCreateForm`),
 *  - aktywne             → widok postępu (punkty, pasek do progu, progi z nagrodami, daty/dni).
 *
 * Pod widokiem — zawsze sekcja „Historia" (`listChallenges`): zakończone listy z finalnym
 * `totalPoints`. Ładuje się niezależnie i degraduje miękko (błąd historii nie psuje widoku
 * aktywnej). Wszystko na jednej trasie (pod-sekcja, nie osobna trasa).
 */

type ActiveState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; challenge: ChallengeWithPoints | null };

export function ChallengePage(): ReactNode {
  const [state, setState] = useState<ActiveState>({ kind: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    // getActiveChallenge rzuca ApiRequestError (HTTP !ok) lub surowy rzut fetch (awaria sieci).
    try {
      const { challenge } = await getActiveChallenge();
      setState({ kind: 'ready', challenge });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell showNav>
      <h2 className="page-title">Lista celów</h2>

      {state.kind === 'loading' ? <LoadingState label="Ładowanie listy celów…" /> : null}

      {state.kind === 'error' ? (
        <ErrorState
          message="Nie udało się wczytać listy celów."
          onRetry={() => {
            void load();
          }}
        />
      ) : null}

      {state.kind === 'ready' && state.challenge === null ? (
        <ChallengeCreateForm
          onSuccess={(challenge) => setState({ kind: 'ready', challenge })}
          onConflict={() => {
            void load();
          }}
        />
      ) : null}

      {state.kind === 'ready' && state.challenge !== null ? (
        <ActiveChallengeView challenge={state.challenge} />
      ) : null}

      {/* Historia zakończonych list — pod widokiem aktywnej / tworzeniem. */}
      {state.kind === 'ready' ? <ChallengeHistory /> : null}
    </AppShell>
  );
}

/** Widok aktywnego wyzwania: punkty, pasek do następnego progu, progi z nagrodami, daty/dni. */
function ActiveChallengeView({ challenge }: { challenge: ChallengeWithPoints }): ReactNode {
  const daysLeftLabel = daysLeftLabelFor(challenge.endDate);

  return (
    <section className="challenge-view" aria-label="Aktywna lista celów">
      <header className="challenge-header">
        <h3>{challenge.title ?? 'Bez nazwy'}</h3>
        <span className="challenge-dates">
          {formatDate(challenge.startDate)} – {formatDate(challenge.endDate)}
          {daysLeftLabel ? ` · ${daysLeftLabel}` : ''}
        </span>
      </header>

      <div className="challenge-points">
        <span className="challenge-points-value">{challenge.totalPoints}</span>
        <span className="challenge-points-label">
          {pointWord(challenge.totalPoints)} zebranych
        </span>
      </div>

      <ProgressToNext challenge={challenge} />

      <ul className="tier-list" aria-label="Progi i nagrody">
        {challenge.tiers.map((tier) => (
          <TierRow key={tier.threshold} tier={tier} />
        ))}
      </ul>
    </section>
  );
}

/** Pasek postępu do następnego progu; gdy `nextThreshold === null` — wszystkie progi zdobyte. */
function ProgressToNext({ challenge }: { challenge: ChallengeWithPoints }): ReactNode {
  const { nextThreshold, pointsToNext, totalPoints } = challenge;

  if (nextThreshold === null || pointsToNext === null) {
    return (
      <div className="challenge-progress challenge-progress-done" role="status">
        Wszystkie progi zdobyte. Brawo!
      </div>
    );
  }

  // Start „okna" paska = NAJWYŻSZY już ODBLOKOWANY próg (albo 0, gdy żaden). NIE zakładamy, że
  // poprzedni próg jest 10 niżej — progi bywają rozrzedzone (user wybiera podzbiór, np. [20,50]),
  // więc `nextThreshold - 10` byłoby błędne (dawało ujemny/za wysoki start → pasek i ARIA poza
  // zakresem). Bierzemy realny poprzedni kamień milowy z `challenge.tiers`.
  const windowStart = highestUnlockedThreshold(challenge.tiers);
  const span = nextThreshold - windowStart; // > 0: nextThreshold jest ściśle wyższy od odblokowanych
  const inWindow = Math.min(span, Math.max(0, totalPoints - windowStart));
  const percent = span > 0 ? Math.round((inWindow / span) * 100) : 0;
  // `aria-valuenow` MUSI leżeć w [valuemin, valuemax]; klampujemy do okna dla poprawności ARIA.
  const ariaNow = Math.min(nextThreshold, Math.max(windowStart, totalPoints));

  return (
    <div className="challenge-progress">
      <div
        className="challenge-progress-bar"
        role="progressbar"
        aria-valuenow={ariaNow}
        aria-valuemin={windowStart}
        aria-valuemax={nextThreshold}
        aria-label={`Postęp do progu ${nextThreshold} punktów`}
      >
        <div className="challenge-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="challenge-progress-label">
        Jeszcze {pointsToNext} {pointWord(pointsToNext)} do progu {nextThreshold}
      </span>
    </div>
  );
}

/** Najwyższy odblokowany próg z listy (kamień milowy = start okna paska); 0 gdy żaden. */
function highestUnlockedThreshold(tiers: ReadonlyArray<RewardTierState>): number {
  let max = 0;
  for (const tier of tiers) {
    if (tier.unlocked && tier.threshold > max) max = tier.threshold;
  }
  return max;
}

/** Wiersz progu: próg + nagroda + znacznik locked/unlocked. */
function TierRow({ tier }: { tier: RewardTierState }): ReactNode {
  return (
    <li className={`tier-row ${tier.unlocked ? 'tier-row-unlocked' : 'tier-row-locked'}`}>
      <span className="tier-threshold">{tier.threshold} pkt</span>
      <span className="tier-reward">{tier.reward}</span>
      <span className="tier-status">
        <span aria-hidden="true">{tier.unlocked ? '✓' : '🔒'}</span>
        <span className="visually-hidden">{tier.unlocked ? 'Odblokowane' : 'Zablokowane'}</span>
      </span>
    </li>
  );
}

type HistoryState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: ChallengeSummary[] };

/** Sekcja „Historia" — zakończone listy z finalnym `totalPoints`. */
function ChallengeHistory(): ReactNode {
  const [state, setState] = useState<HistoryState>({ kind: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const { items } = await listChallenges();
      setState({ kind: 'ready', items });
    } catch {
      setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="challenge-history" aria-label="Historia list celów">
      <h3 className="challenge-history-title">Historia</h3>

      {state.kind === 'loading' ? <LoadingState label="Ładowanie historii…" /> : null}

      {state.kind === 'error' ? (
        <ErrorState
          message="Nie udało się wczytać historii list."
          onRetry={() => {
            void load();
          }}
        />
      ) : null}

      {state.kind === 'ready' && state.items.length === 0 ? (
        <EmptyState
          title="Brak zakończonych list"
          message="Ukończone 30-dniowe listy pojawią się tutaj."
        />
      ) : null}

      {state.kind === 'ready' && state.items.length > 0 ? (
        <ul className="challenge-history-list">
          {state.items.map((item) => (
            <li key={item.id} className="challenge-history-row">
              <span className="challenge-history-name">{item.title ?? 'Bez nazwy'}</span>
              <span className="challenge-history-dates">
                {formatDate(item.startDate)} – {formatDate(item.endDate)}
              </span>
              <span className="challenge-history-points">
                {item.totalPoints} {pointWord(item.totalPoints)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Etykieta „ile zostało" liczona INKLUZYWNIE (dzień końcowy się liczy). BE traktuje wyzwanie jako
 * aktywne dopóki `endDate >= dziś`, więc gdy `endDate == dziś` ono WCIĄŻ TRWA → nie mówimy „0 dni",
 * tylko „ostatni dzień". `diff` w kalendarzowych dniach + 1 dzień inkluzywny:
 *   endDate == dziś  → diff 0 → „ostatni dzień"
 *   endDate == jutro → diff 1 → „2 dni do końca" (dziś + jutro)
 *
 * TRADE-OFF (świadomy): liczymy względem strefy PRZEGLĄDARKI (`Date` klienta), a autorytetem doby
 * jest SERWER (`users.timezone`). Na styku stref mogą wyjść ±1 dzień — to tylko etykieta
 * prezentacyjna (okno i punkty liczy BE), więc akceptujemy. `null` = zła data (nie renderujemy).
 */
function daysLeftLabelFor(endDate: string): string | null {
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  if (diff <= 0) return 'ostatni dzień';
  const daysLeft = diff + 1; // inkluzywnie: pozostałe pełne dni + dzień dzisiejszy
  return `${daysLeft} ${dayWord(daysLeft)} do końca`;
}

/** Polska odmiana „dzień/dni" (1 → dzień; inaczej → dni). `n` nieujemne. */
function dayWord(n: number): string {
  return n === 1 ? 'dzień' : 'dni';
}

/** Polska odmiana „punkt/punkty/punktów". */
function pointWord(n: number): string {
  if (n === 1) return 'punkt';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'punkty';
  return 'punktów';
}
