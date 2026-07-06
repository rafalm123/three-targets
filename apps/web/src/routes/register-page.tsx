import { registerInputSchema, resolveBrowserTimeZone } from '@trzy-cele/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { authClient } from '../lib/auth-client';
import { authErrorMessage } from '../lib/auth-errors';

type FieldErrors = { name?: string; email?: string; password?: string; timezone?: string };

/**
 * Ekran rejestracji (FE-3). `timezone` jest WYMAGANE przez backend (BE-16) — wykrywamy je z
 * przeglądarki (`Intl`) i wysyłamy razem z formularzem; użytkownik go nie wpisuje. `name` =
 * wyświetlana nazwa. Po sukcesie Better Auth zakłada sesję → guardy przekierują na `/`.
 */
export function RegisterPage(): ReactNode {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    // Strefa wykrywana z przeglądarki. Brak poprawnej strefy = błąd walidacji, nie zgadywanie.
    const timezone = resolveBrowserTimeZone();
    const parsed = registerInputSchema.safeParse({ name, email, password, timezone });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        name: flat.name?.[0],
        email: flat.email?.[0],
        password: flat.password?.[0],
        timezone: flat.timezone?.[0],
      });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const { error } = await authClient.signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      timezone: parsed.data.timezone,
    });

    setSubmitting(false);
    if (error) setFormError(authErrorMessage(error));
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <h2>Rejestracja</h2>

      {formError ? (
        <div className="form-error" role="alert">
          {formError}
        </div>
      ) : null}

      {/* Strefa czasowa nie ma poprawnej wartości z przeglądarki — rzadki edge case. */}
      {fieldErrors.timezone ? (
        <div className="form-error" role="alert">
          {fieldErrors.timezone}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="register-name">Nazwa</label>
        <input
          id="register-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={fieldErrors.name ? true : undefined}
        />
        {fieldErrors.name ? <span className="field-error">{fieldErrors.name}</span> : null}
      </div>

      <div className="field">
        <label htmlFor="register-email">E-mail</label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={fieldErrors.email ? true : undefined}
        />
        {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
      </div>

      <div className="field">
        <label htmlFor="register-password">Hasło</label>
        <input
          id="register-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={fieldErrors.password ? true : undefined}
        />
        {fieldErrors.password ? <span className="field-error">{fieldErrors.password}</span> : null}
      </div>

      <button type="submit" className="button" disabled={submitting}>
        {submitting ? 'Zakładanie konta…' : 'Załóż konto'}
      </button>

      <p className="form-footer">
        Masz już konto? <Link to="/login">Zaloguj się</Link>
      </p>
    </form>
  );
}
