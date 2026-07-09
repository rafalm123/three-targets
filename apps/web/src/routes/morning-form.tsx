import { morningEntrySchema, type Day, type MorningEntry } from '@trzy-cele/shared';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiRequestError, createDay, GENERIC_API_ERROR } from '../lib/api';

/**
 * Formularz „Rano" — używany w DWÓCH trybach (reuse zamiast duplikacji):
 *  - **tworzenie** (FE-7): pusty formularz → `POST /api/days` (`createDay`, domyślny `onSubmit`),
 *  - **edycja** (BE-11): prefill z `initialDay` → `PATCH /api/days/today` (wstrzyknięty `onSubmit`).
 *
 * 1 cel główny + 2 poboczne (`title` wymagany, `note` opcjonalna) + notatka poranna. Walidacja
 * kontraktem `morningEntrySchema` (`safeParse`) PRZED wysłaniem — to samo źródło prawdy, co backend.
 * PATCH ma semantykę **pełnego zastąpienia**: `buildEntry` zawsze składa komplet 3 celów +
 * `morningNote`, więc pominięte pola opcjonalne serwer wyzeruje (null) — dokładnie jak trzeba.
 *
 * Po sukcesie `onSuccess(day)` oddaje dzień w górę (HUB przełącza widok). Konflikty (`409`/`404`)
 * są przekazywane per-kod do `onConflict(code)` — wołający decyduje (zwykle: przeładuj HUB),
 * bez pokazywania mylącego błędu w formularzu.
 */

/** Kody błędów HTTP, które wołający obsługuje przez przeładowanie (nie pokazujemy ich w formie). */
type ConflictCode = 'DAY_ALREADY_EXISTS' | 'DAY_ALREADY_CLOSED' | 'NO_DAY_TODAY';
const CONFLICT_CODES: readonly ConflictCode[] = [
  'DAY_ALREADY_EXISTS',
  'DAY_ALREADY_CLOSED',
  'NO_DAY_TODAY',
];

/** Błędy pól formularza — indeksowane, bo cele poboczne to lista. */
interface FieldErrors {
  mainTitle?: string;
  secondaryTitle?: [string | undefined, string | undefined];
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
    secondary: [goal(state.sec0Title, state.sec0Note), goal(state.sec1Title, state.sec1Note)],
    ...(trimmedOrUndef(state.morningNote) ? { morningNote: state.morningNote.trim() } : {}),
  };
}

/** Prefill stanu formularza z istniejącego dnia (tryb edycji). Brak dnia → pusty formularz. */
function initialState(day?: Day): FormState {
  if (!day) return EMPTY;
  const main = day.goals.find((g) => g.kind === 'main');
  const secondary = day.goals.filter((g) => g.kind === 'secondary');
  return {
    mainTitle: main?.title ?? '',
    mainNote: main?.note ?? '',
    sec0Title: secondary[0]?.title ?? '',
    sec0Note: secondary[0]?.note ?? '',
    sec1Title: secondary[1]?.title ?? '',
    sec1Note: secondary[1]?.note ?? '',
    morningNote: day.morningNote ?? '',
  };
}

export function MorningForm({
  initialDay,
  heading = 'Poranek — zapisz 3 cele',
  submitLabel = 'Zapisz poranek',
  submittingLabel = 'Zapisywanie…',
  onSubmit = createDay,
  onSuccess,
  onConflict,
  onCancel,
}: {
  /** Dzień do prefill (tryb edycji). Pusty = tryb tworzenia. */
  initialDay?: Day;
  heading?: string;
  submitLabel?: string;
  submittingLabel?: string;
  /** Wywołanie zapisu — domyślnie `createDay` (POST); w edycji wstrzykujemy `updateMorning` (PATCH). */
  onSubmit?: (entry: MorningEntry) => Promise<Day>;
  /** Sukces zapisu → dzień w górę (HUB przełącza widok). */
  onSuccess: (day: Day) => void;
  /** Konflikt HTTP (409/404) → wołający zwykle przeładowuje HUB. */
  onConflict?: (code: ConflictCode) => void;
  /** Opcjonalny „Anuluj" (tryb edycji — powrót do widoku dnia). */
  onCancel?: () => void;
}): ReactNode {
  const [state, setState] = useState<FormState>(() => initialState(initialDay));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Refy do pól wymaganych — po nieudanej walidacji przenosimy fokus na pierwsze błędne
  // (FE-12/NIT-3, a11y). Kolejność: główny → poboczny 1 → poboczny 2.
  const mainTitleRef = useRef<HTMLInputElement>(null);
  const sec0TitleRef = useRef<HTMLInputElement>(null);
  const sec1TitleRef = useRef<HTMLInputElement>(null);
  const secTitleRefs = [sec0TitleRef, sec1TitleRef] as const;

  function set<K extends keyof FormState>(key: K, value: string): void {
    setState((prev) => ({ ...prev, [key]: value }));
  }

  /** Fokus na pierwsze błędne pole (główny → poboczne) — a11y po nieudanej walidacji. */
  function focusFirstError(errors: FieldErrors): void {
    if (errors.mainTitle) {
      mainTitleRef.current?.focus();
      return;
    }
    const badSecondary = errors.secondaryTitle?.findIndex(Boolean) ?? -1;
    if (badSecondary >= 0) secTitleRefs[badSecondary]?.current?.focus();
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
      // Obrona przed cichym fiaskiem: issue na polach bez własnego mapowania (np. za długa
      // `note`/`morningNote`, max 2000) nie trafi do żadnego pola. Gdy NIC się nie zmapowało,
      // pokazujemy pierwszy komunikat w form-error — użytkownik ZAWSZE dostaje feedback.
      if (!errors.mainTitle && !errors.secondaryTitle) {
        setFormError(parsed.error.issues[0]?.message ?? GENERIC_API_ERROR);
      }
      focusFirstError(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    // onSubmit rzuca ApiRequestError dla odpowiedzi HTTP !ok, a natywny fetch RZUCA przy awarii
    // sieci → jeden try/catch obsługuje oba, formularz nie zawisa (jak w formularzach auth).
    try {
      const day = await onSubmit(parsed.data);
      onSuccess(day);
    } catch (err) {
      if (err instanceof ApiRequestError && isConflictCode(err.code)) {
        onConflict?.(err.code);
        return;
      }
      setFormError(err instanceof ApiRequestError ? err.message : GENERIC_API_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <h2>{heading}</h2>

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
            ref={mainTitleRef}
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
            maxLength={2000}
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
                ref={secTitleRefs[i]}
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
                maxLength={2000}
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
          maxLength={2000}
          value={state.morningNote}
          onChange={(e) => set('morningNote', e.target.value)}
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="button" disabled={submitting}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="button button-secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Anuluj
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** Zawęża `string | undefined` do znanego kodu konfliktu (type guard dla `onConflict`). */
function isConflictCode(code: string | undefined): code is ConflictCode {
  return code !== undefined && (CONFLICT_CODES as readonly string[]).includes(code);
}
