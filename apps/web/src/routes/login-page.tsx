import { loginInputSchema } from '@trzy-cele/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/app-shell';
import { authClient } from '../lib/auth-client';
import { authErrorMessage, GENERIC_AUTH_ERROR } from '../lib/auth-errors';

/**
 * Ekran logowania (FE-3). Walidacja wejścia kontraktem z `@trzy-cele/shared`, mapowanie
 * błędów Better Auth na komunikaty PL. Po sukcesie `useSession` w guardach przełapie zmianę
 * sesji i PublicOnlyRoute przekieruje na `/` — bez ręcznej nawigacji tutaj.
 */
export function LoginPage(): ReactNode {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = loginInputSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: flat.email?.[0], password: flat.password?.[0] });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    // signIn.email zwraca { error } dla odpowiedzi HTTP, ale RZUCA przy awarii sieci
    // (better-fetch nie łapie wyjątku fetch) → try/catch, by nie zawiesić formularza.
    try {
      const { error } = await authClient.signIn.email({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) setFormError(authErrorMessage(error));
    } catch {
      setFormError(GENERIC_AUTH_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <form className="form" onSubmit={handleSubmit} noValidate>
        <h2>Logowanie</h2>

        {formError ? (
          <div className="form-error" role="alert">
            {formError}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
          />
          {fieldErrors.email ? (
            <span id="login-email-error" className="field-error">
              {fieldErrors.email}
            </span>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="login-password">Hasło</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
          />
          {fieldErrors.password ? (
            <span id="login-password-error" className="field-error">
              {fieldErrors.password}
            </span>
          ) : null}
        </div>

        <button type="submit" className="button" disabled={submitting}>
          {submitting ? 'Logowanie…' : 'Zaloguj się'}
        </button>

        <p className="form-footer">
          Nie masz konta? <Link to="/register">Załóż konto</Link>
        </p>
      </form>
    </AppShell>
  );
}
