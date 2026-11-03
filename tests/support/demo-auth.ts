import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { totpCode } from '../../server/dev/totp';
import { requireLoopbackUrl } from './loopback';

function envFile() {
  return existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
}

function localAuthEnv() {
  const file = envFile();
  const url = requireLoopbackUrl(
    'SUPABASE_URL',
    process.env.SUPABASE_URL ?? file.SUPABASE_URL,
  );
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? file.SUPABASE_SECRET_KEY;
  if (!secretKey)
    throw new Error(
      'Signed-in tests need SUPABASE_SECRET_KEY of the local stack',
    );
  return { url, secretKey };
}

/** Server-issued magic-link token of a seeded @demo user; the app's POST /api/v1/auth/confirm consumes it. */
export async function magicLinkTokenHash(email: string): Promise<string> {
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
  const hash = data.properties?.hashed_token;
  if (error || !hash)
    throw new Error(`Local Supabase issued no sign-in link for ${email}`);
  return hash;
}

/** Current code of the seeded demo TOTP factor (local stack only). */
export function demoTotpCode(): string {
  const secret =
    process.env.DEV_DEMO_TOTP_SECRET ?? envFile().DEV_DEMO_TOTP_SECRET;
  if (!secret)
    throw new Error(
      'Admin/Finance sign-in needs DEV_DEMO_TOTP_SECRET of the local seed',
    );
  return totpCode(secret);
}
