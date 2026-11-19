import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  localStatusUrl,
  localStatusValue,
  readLocalSupabaseStatus,
} from './local-supabase';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function ciEnvironment(status: Record<string, unknown>) {
  const api = localStatusUrl(status, 'API_URL');
  const database = localStatusUrl(status, 'DB_URL');
  const mailbox = localStatusUrl(status, 'MAILPIT_URL');
  if (
    api.protocol !== 'http:' ||
    mailbox.protocol !== 'http:' ||
    !['postgres:', 'postgresql:'].includes(database.protocol)
  )
    throw new Error('Unexpected local Supabase protocol');
  const runtime = new URL(database);
  runtime.username = 'app_rw';
  runtime.password = randomBytes(32).toString('hex');
  return {
    APP_ENV: 'test',
    DATABASE_URL: runtime.toString(),
    DATABASE_MIGRATION_URL: database.toString(),
    SUPABASE_URL: api.origin,
    SUPABASE_PUBLISHABLE_KEY: localStatusValue(status, 'PUBLISHABLE_KEY'),
    SUPABASE_SECRET_KEY: localStatusValue(status, 'SECRET_KEY'),
    MAILPIT_URL: mailbox.origin,
    AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString('base64url'),
    DEV_DEMO_TOTP_SECRET: [...randomBytes(32)]
      .map((value) => BASE32[value % 32])
      .join(''),
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (
    process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.CI !== 'true' ||
    !process.env.GITHUB_ENV
  )
    throw new Error('CI environment export runs only inside GitHub Actions');
  const environment = ciEnvironment(readLocalSupabaseStatus());
  for (const [name, value] of Object.entries(environment)) {
    if (/KEY|SECRET|DATABASE/.test(name))
      process.stdout.write(`::add-mask::${value}\n`);
    appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
  }
  console.info('Local Supabase CI environment exported; values masked.');
}
