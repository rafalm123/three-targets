import { describe, expect, it } from 'vitest';

/**
 * Smoke test (regresja po CR FE-2): sam import modułu tworzy `authClient` w scope modułu.
 * Wcześniej jawny względny `baseURL` rzucał `BetterAuthError` przy imporcie i wywalał całą apkę.
 * Ten test pilnuje, że import się udaje i klient odsłania oczekiwane API.
 */
describe('authClient (smoke)', () => {
  it('importuje się bez rzucania i eksponuje API auth', async () => {
    const mod = await import('./auth-client');
    expect(mod.authClient).toBeDefined();
    expect(typeof mod.authClient.signIn.email).toBe('function');
    expect(typeof mod.authClient.signUp.email).toBe('function');
    expect(typeof mod.authClient.signOut).toBe('function');
    expect(typeof mod.useSession).toBe('function');
  });
});
