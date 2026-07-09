import { morningEntrySchema, type Day, type MorningEntry } from '@trzy-cele/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiRequestError, createDay, GENERIC_API_ERROR } from '../lib/api';

/**
 * Formularz „Rano" (FE-7): 1 cel główny + 2 poboczne (`title` wymagany, `note` opcjonalna) +
 * notatka poranna. Walidacja kontraktem `morningEntrySchema` (`safeParse`) PRZED wysłaniem —
 * to samo źródło prawdy, co backend. Po sukcesie `onCreated(day)` oddaje utworzony dzień w górę
 * (HUB przełącza się na widok dnia). 409 `DAY_ALREADY_EXISTS` = dzień powstał równolegle →
 * `onDayAlreadyExists()` (HUB przeładuje „dziś"), zamiast pokazywać mylący błąd.
 */

/** Błędy pól formularza — indeksowane, bo cele poboczne to lista. */
interface FieldErrors {
  mainTitle?: string;
  secondaryTitle?: [string | undefined, string | undefined];
}

/** Zbiera wartości formularza w kształt `MorningEntry` (puste opcjonalne pola pomijamy). */
function buildEntry(state: FormState): MorningEntry {
  const trimmedOrUndef = (v: string): string | undefined => {
    const t = v.trim();
    return t.length > 0 ? t : undefined;
  };
  const goal = (title: string, note: string) => ({
    title: title.trim(),
    ...(trimmedOrUndef(note) ? { note: note.trim() } : {}),
  });
  return {
    main: goal(state.mainTitle, state.mainNote),
    secondary: [
      goal(state.sec0Title, state.sec0Note),
      goal(state.sec1Title, state.sec1Note),
    ],
    ...(trimmedOrUndef(state.morningNote) ? { morningNote: state.morningNote.trim() } : {}),
  };
}

interface FormState {
  mainTitle: string;
  mainNote: string;
  sec0Title: string;
  sec0Note: string;
  sec1Title: string;
  sec1Note: string;
  morningNote: string;
}

const EMPTY: FormState = {
  mainTitle: '',
  mainNote: '',
  sec0Title: '',
  sec0Note: '',
  sec1Title: '',
  sec1Note: '',
  morningNote: '',
};

export function MorningForm({
  onCreated,
  onDayAlreadyExists,
}: {
  onCreated: (day: Day) => void;
  onDayAlreadyExists: () => void;
}): ReactNode {
  const [state, setState] = useState<FormState>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormState>(key: K, value: string): void {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = morningEntrySchema.safeParse(buildEntry(state));
    if (!parsed.success) {
      // Mapujemy błędy zod na pola: `main.title` i `secondary[i].title` (jedyne wymagane).
      const errors: FieldErrors = {};
      const sec: [string | undefined, string | undefined] = [undefined, undefined];
      for (const issue of parsed.error.issues) {
        const [root, indexOrTitle, maybeTitle] = issue.path;
        if (root === 'main' && indexOrTitle === 'title') errors.mainTitle = issue.message;
        if (root === 'secondary' && typeof indexOrTitle === 'number' && maybeTitle === 'title') {
          sec[indexOrTitle] = issue.message;
        }
      }
      if (sec[0] || sec[1]) errors.secondaryTitle = sec;
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    // createDay rzuca ApiRequestError dla odpowiedzi HTTP !ok, a natywny fetch RZUCA przy awarii
    // sieci → jeden try/catch obsługuje oba, formularz nie zawisa (jak w formularzach auth).
    try {
      const day = await createDay(parsed.data);
      onCreated(day);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'DAY_ALREADY_EXISTS') {
        onDayAlreadyExists();
        return;
      }
      setFormError(err instanceof ApiRequestError ? err.message : GENERIC_API_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <h2>Poranek — zapisz 3 cele</h2>

      {formError ? (
        <div className="form-error" role="alert">
          {formError}
        </div>
      ) : null}

      <fieldset className="goal-fieldset">
        <legend>Cel główny</legend>
        <div className="field">
          <label htmlFor="main-title">Tytuł</label>
          <input
            id="main-title"
            type="text"
            value={state.mainTitle}
            onChange={(e) => set('mainTitle', e.target.value)}
            aria-invalid={fieldErrors.mainTitle ? true : undefined}
            aria-describedby={fieldErrors.mainTitle ? 'main-title-error' : undefined}
          />
          {fieldErrors.mainTitle ? (
            <span id="main-title-error" className="field-error">
              {fieldErrors.mainTitle}
            </span>
          ) : null}
        </div>
        <div className="field">
          <label htmlFor="main-note">Notatka (opcjonalnie)</label>
          <textarea
            id="main-note"
            value={state.mainNote}
            onChange={(e) => set('mainNote', e.target.value)}
          />
        </div>
      </fieldset>

      {([0, 1] as const).map((i) => {
        const titleKey = (i === 0 ? 'sec0Title' : 'sec1Title') as keyof FormState;
        const noteKey = (i === 0 ? 'sec0Note' : 'sec1Note') as keyof FormState;
        const err = fieldErrors.secondaryTitle?.[i];
        return (
          <fieldset key={i} className="goal-fieldset">
            <legend>Cel poboczny {i + 1}</legend>
            <div className="field">
              <label htmlFor={`sec-${i}-title`}>Tytuł</label>
              <input
                id={`sec-${i}-title`}
                type="text"
                value={state[titleKey]}
                onChange={(e) => set(titleKey, e.target.value)}
                aria-invalid={err ? true : undefined}
                aria-describedby={err ? `sec-${i}-title-error` : undefined}
              />
              {err ? (
                <span id={`sec-${i}-title-error`} className="field-error">
                  {err}
                </span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor={`sec-${i}-note`}>Notatka (opcjonalnie)</label>
              <textarea
                id={`sec-${i}-note`}
                value={state[noteKey]}
                onChange={(e) => set(noteKey, e.target.value)}
              />
            </div>
          </fieldset>
        );
      })}

      <div className="field">
        <label htmlFor="morning-note">Notatka poranna (opcjonalnie)</label>
        <textarea
          id="morning-note"
          value={state.morningNote}
          onChange={(e) => set('morningNote', e.target.value)}
        />
      </div>

      <button type="submit" className="button" disabled={submitting}>
        {submitting ? 'Zapisywanie…' : 'Zapisz poranek'}
      </button>
    </form>
  );
}
