import type { ChallengeWithPoints } from '@trzy-cele/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiRequestError, GENERIC_API_ERROR, createChallenge } from '../lib/api';
import {
  TIER_THRESHOLDS,
  buildChallengeCreate,
  emptyTierDraft,
  type TierDraft,
} from './challenge-tiers';

/**
 * Ekran „Utwórz listę" (FE-P2) — pokazywany, gdy nie ma aktywnego 30-dniowego wyzwania.
 *
 * Tytuł opcjonalny + wiersz na każdy próg (10/20/…/60); użytkownik wpisuje nagrodę tylko dla
 * progów, które chce odblokowywać. Progi bez nagrody są pomijane w wysyłce. Walidacja PRZED
 * `createChallenge`: min 1 próg z niepustą nagrodą (thresholdy wg kontraktu są gwarantowane
 * konstrukcją `TIER_THRESHOLDS`, więc nie walidujemy ich tu ponownie).
 *
 * Konflikt `409 ACTIVE_CHALLENGE_EXISTS` (wyścig: aktywna powstała w międzyczasie) → `onConflict`,
 * wołający przeładowuje HUB (pokaże aktywną). Inne błędy (walidacja BE / sieć / 5xx) → `formError`.
 */

export function ChallengeCreateForm({
  onSuccess,
  onConflict,
}: {
  /** Sukces utworzenia → lista aktywna w górę (HUB pokaże widok aktywnej). */
  onSuccess: (challenge: ChallengeWithPoints) => void;
  /** 409 `ACTIVE_CHALLENGE_EXISTS` → wołający przeładowuje HUB. */
  onConflict?: () => void;
}): ReactNode {
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState<TierDraft>(() => emptyTierDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function setReward(threshold: number, value: string): void {
    setDraft((prev) => ({ ...prev, [threshold]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Twardy guard double-submit: nie polegamy tylko na `disabled` przycisku (submit może przyjść
    // z Entera / szybkiego podwójnego kliku zanim re-render zablokuje przycisk).
    if (submitting) return;
    setFormError(null);

    // Inwariant „min 1 próg" jest w `buildChallengeCreate` (null = brak nagród) — nie duplikujemy go.
    const payload = buildChallengeCreate(title, draft);
    if (payload === null) {
      setFormError('Dodaj co najmniej jedną nagrodę (dla dowolnego progu).');
      return;
    }

    setSubmitting(true);
    // createChallenge rzuca ApiRequestError (HTTP !ok) lub surowy rzut fetch (awaria sieci) — oba w try.
    try {
      const challenge = await createChallenge(payload);
      onSuccess(challenge);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'ACTIVE_CHALLENGE_EXISTS') {
        onConflict?.();
        return;
      }
      setFormError(err instanceof ApiRequestError ? err.message : GENERIC_API_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <h2>Utwórz listę celów</h2>
      <p className="form-hint">
        30-dniowe wyzwanie: +1 punkt za każdy dowieziony cel poboczny. Ustaw nagrody dla progów
        punktowych, które chcesz odblokowywać.
      </p>

      {formError ? (
        <div className="form-error" role="alert">
          {formError}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="challenge-title">Tytuł (opcjonalnie)</label>
        <input
          id="challenge-title"
          type="text"
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <fieldset className="tier-fieldset">
        <legend>Nagrody za progi punktowe</legend>
        <ul className="tier-input-list">
          {TIER_THRESHOLDS.map((threshold) => (
            <li key={threshold} className="tier-input-row">
              <label htmlFor={`tier-${threshold}`} className="tier-input-threshold">
                {threshold} pkt
              </label>
              <input
                id={`tier-${threshold}`}
                type="text"
                maxLength={200}
                placeholder="Nagroda (opcjonalnie)"
                value={draft[threshold]}
                onChange={(e) => setReward(threshold, e.target.value)}
              />
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Tworzenie…' : 'Utwórz listę'}
        </button>
      </div>
    </form>
  );
}
