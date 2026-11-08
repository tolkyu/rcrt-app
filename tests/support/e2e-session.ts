import { expect, type APIRequestContext } from '@playwright/test';
import { demoTotpCode, magicLinkTokenHash } from './demo-auth';
import { E2E_ORIGIN } from './origins';

export { E2E_ORIGIN, GOOGLE_E2E_ORIGIN } from './origins';
export const MUTATION_HEADERS = {
  origin: E2E_ORIGIN,
  'x-csrf-protection': '1',
} as const;

/**
 * Real sign-in for seeded @demo users: a server-issued magic-link token from the local Supabase
 * stack is consumed through the app's own POST /api/v1/auth/confirm, which sets the session cookies.
 */
export async function signIn(request: APIRequestContext, email: string) {
  const response = await request.post('/api/v1/auth/confirm', {
    headers: MUTATION_HEADERS,
    data: { token_hash: await magicLinkTokenHash(email) },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/**
 * Admin/Finance: magic link, then the seeded demo TOTP factor verified through our own
 * POST /api/v1/auth/mfa/verify, so the session is recorded as app-verified aal2 (SEC-AUTH-R02).
 */
export async function signInWithTotp(
  request: APIRequestContext,
  email: string,
) {
  await signIn(request, email);
  const status = await request.get('/api/v1/auth/mfa');
  expect(status.status()).toBe(200);
  const { factors } = (await status.json()) as { factors: { id: string }[] };
  const response = await request.post('/api/v1/auth/mfa/verify', {
    headers: MUTATION_HEADERS,
    data: { factorId: factors[0]!.id, code: demoTotpCode() },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** Seeded users whose sessions the `e2e-sessions` setup project creates once per run. */
export const E2E_USERS = {
  'admin@demo': 'totp',
  'finance@demo': 'totp',
  'head.recruiter.gambling@demo': 'link',
  'head.hr@demo': 'link',
  'hr@demo': 'link',
  'recruiter1.gambling@demo': 'link',
  'recruiter2.gambling@demo': 'link',
  'vasyl.tl@demo': 'link',
  'taras.tl@demo': 'link',
  'recruiter.crypto@demo': 'link',
} as const;
export type E2EUser = keyof typeof E2E_USERS;

/**
 * One stored session per user for the whole run: parallel sign-ins of the same user invalidate each
 * other's magic links, and every sign-in counts against the 30 / 15 min per-IP confirm limit.
 */
const slug = (email: string) => email.replace(/[^a-z0-9.]/g, '_');

export const sessionFile = (email: E2EUser) =>
  `.playwright-auth/${slug(email)}.json`;

/** A second Admin session stopped after the magic link: still aal1, the state `/mfa/verify` is shown in. */
export const MFA_PENDING_USER = 'admin@demo' satisfies E2EUser;
export const mfaPendingSessionFile = `.playwright-auth/mfa-pending_${slug(MFA_PENDING_USER)}.json`;
