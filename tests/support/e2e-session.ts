import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { expect, type APIRequestContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

export const E2E_ORIGIN = 'http://localhost:3100';
export const MUTATION_HEADERS = {
  origin: E2E_ORIGIN,
  'x-csrf-protection': '1',
} as const;

function localAuthEnv() {
  const file = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
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
