import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { expect, type APIRequestContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { totpCode } from '../../server/dev/totp';

export const E2E_ORIGIN = 'http://localhost:3100';
export const MUTATION_HEADERS = {
  origin: E2E_ORIGIN,
  'x-csrf-protection': '1',
} as const;

function envFile() {
  return existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
}

function localAuthEnv() {
  const file = envFile();
  const url = process.env.SUPABASE_URL ?? file.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? file.SUPABASE_SECRET_KEY;
  if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
    throw new Error(
      'Signed-in E2E needs the local Supabase stack (loopback SUPABASE_URL)',
    );
  if (!secretKey)
    throw new Error(
      'Signed-in E2E needs SUPABASE_SECRET_KEY of the local stack',
    );
  return { url, secretKey };
}

/**
 * Real sign-in for seeded @demo users: a server-issued magic-link token from the local Supabase
 * stack is consumed through the app's own POST /api/v1/auth/confirm, which sets the session cookies.
 */
export async function signIn(request: APIRequestContext, email: string) {
  const { url, secretKey } = localAuthEnv();
  const admin = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }).auth.admin;
  const { data, error } = await admin.generateLink({
    type: 'magiclink',
    email,
  });
  expect(error).toBeNull();
  const response = await request.post('/api/v1/auth/confirm', {
    headers: MUTATION_HEADERS,
    data: { token_hash: data.properties?.hashed_token },
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
  const secret =
    process.env.DEV_DEMO_TOTP_SECRET ?? envFile().DEV_DEMO_TOTP_SECRET;
  if (!secret)
    throw new Error('Admin E2E needs DEV_DEMO_TOTP_SECRET of the local seed');
  const status = await request.get('/api/v1/auth/mfa');
  expect(status.status()).toBe(200);
  const { factors } = (await status.json()) as { factors: { id: string }[] };
  const response = await request.post('/api/v1/auth/mfa/verify', {
    headers: MUTATION_HEADERS,
    data: { factorId: factors[0]!.id, code: totpCode(secret) },
  });
  expect(response.status(), await response.text()).toBe(200);
}
