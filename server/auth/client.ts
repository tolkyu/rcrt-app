import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { AuthCookieStore } from './cookies';
import { supabaseAuthConfig } from './config';

export interface TotpFactor {
  readonly id: string;
  readonly friendlyName: string | null;
  readonly status: 'verified' | 'unverified';
}

/** Supabase Auth calls bound to the caller's session cookies; every token it returns is re-verified by the caller. */
export interface AuthClient {
  verifyMagicLink(tokenHash: string): Promise<{ accessToken: string } | null>;
  googleAuthorizeUrl(redirectTo: string): Promise<string | null>;
  /** Google identity email and its verification flag come from the provider record, not user metadata. */
  exchangeCode(code: string): Promise<{
    accessToken: string;
    googleEmail: string | null;
    googleEmailVerified: boolean;
  } | null>;
  currentAccessToken(): Promise<string | null>;
  signOut(scope: 'local' | 'others'): Promise<boolean>;
  listTotpFactors(): Promise<TotpFactor[] | null>;
  enrollTotp(
    friendlyName: string,
  ): Promise<{ factorId: string; qrCode: string; secret: string } | null>;
  verifyTotp(
    factorId: string,
    code: string,
  ): Promise<{ accessToken: string } | null>;
}

export function createAuthClient(cookies: AuthCookieStore): AuthClient {
  const { url, publishableKey } = supabaseAuthConfig();
  const client = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (values) => cookies.setAll(values),
    },
    cookieOptions: { httpOnly: true, sameSite: 'lax', path: '/' },
    auth: { flowType: 'pkce', detectSessionInUrl: false },
  });
  return {
    async verifyMagicLink(tokenHash) {
      const { data, error } = await client.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'magiclink',
      });
      return !error && data.session
        ? { accessToken: data.session.access_token }
        : null;
    },
    async googleAuthorizeUrl(redirectTo) {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      return !error && data.url ? data.url : null;
    },
    async exchangeCode(code) {
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error || !data.session) return null;
      const google = data.session.user.identities?.find(
        (identity) => identity.provider === 'google',
      )?.identity_data;
      return {
        accessToken: data.session.access_token,
        googleEmail: typeof google?.email === 'string' ? google.email : null,
        googleEmailVerified: google?.email_verified === true,
      };
    },
    async currentAccessToken() {
      const { data, error } = await client.auth.getSession();
      return !error && data.session ? data.session.access_token : null;
    },
    async signOut(scope) {
      const { error } = await client.auth.signOut({ scope });
      return error === null;
    },
    async listTotpFactors() {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) return null;
      return data.all
        .filter((factor) => factor.factor_type === 'totp')
        .map((factor) => ({
          id: factor.id,
          friendlyName: factor.friendly_name ?? null,
          status: factor.status === 'verified' ? 'verified' : 'unverified',
        }));
    },
    async enrollTotp(friendlyName) {
      const { data, error } = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName,
        issuer: 'Hiring',
      });
      return !error && data
        ? {
            factorId: data.id,
            qrCode: data.totp.qr_code,
            secret: data.totp.secret,
          }
        : null;
    },
    async verifyTotp(factorId, code) {
      const { data, error } = await client.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      return !error && data ? { accessToken: data.access_token } : null;
    },
  };
}
