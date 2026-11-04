import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import {
  assertDisposableLocalData,
  parseLocalDatabaseTargets,
} from '../../../lib/env';
import { toolErrorSummary } from '../tool-error';
import { DEMO_USERS } from './index';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const BASE32 = /^[A-Z2-7]{32}$/;

function demoFactorId(email: string) {
  const hash = createHash('sha256')
    .update(`hris:demo-totp:${email}`)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Local-only Supabase Auth identities for the @demo fixture (DEV-1, T4-H02): confirmed users, linked
 * app users, and for Admin/Finance a verified TOTP factor whose secret exists only in the local .env.
 */
export async function seedDemoAuth(source: Record<string, string | undefined>) {
  const { migrationUrl } = parseLocalDatabaseTargets(source);
  const supabaseUrl = source.SUPABASE_URL;
  const secretKey = source.SUPABASE_SECRET_KEY;
  const totpSecret = source.DEV_DEMO_TOTP_SECRET;
  if (
    !supabaseUrl ||
    !loopback.has(new URL(supabaseUrl).hostname) ||
    !secretKey
  )
    throw new Error(
      'Demo auth seeding requires a loopback SUPABASE_URL and SUPABASE_SECRET_KEY',
    );
  if (!totpSecret || !BASE32.test(totpSecret))
    throw new Error(
      'Demo auth seeding requires DEV_DEMO_TOTP_SECRET (32 base32 characters)',
    );

  const sql = postgres(migrationUrl, {
    prepare: false,
    max: 1,
    onnotice: () => undefined,
  });
  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }).auth.admin;
  try {
    await assertDisposableLocalData(sql);
    for (const user of DEMO_USERS) {
      const { acceptedAt } = user;
      if (user.roles.length === 0 || acceptedAt === null) continue;
      const created = await admin.createUser({
        email: user.email,
        email_confirm: true,
      });
      let authUserId = created.data.user?.id ?? null;
      if (!authUserId) {
        if (created.error?.code !== 'email_exists')
          throw new Error(
            `Auth user creation failed (${created.error?.code ?? 'unknown'})`,
          );
        const [existing] = await sql<
          { id: string }[]
        >`select id from auth.users where email = ${user.email}`;
        authUserId = existing?.id ?? null;
      }
      if (!authUserId) throw new Error('Auth user lookup failed');
      if (user.deactivatedAt)
        await admin.updateUserById(authUserId, { ban_duration: '876000h' });
      await sql`
        update app.app_user
        set auth_user_id = ${authUserId}, activated_at = coalesce(activated_at, ${acceptedAt})
        where email = ${user.email}
      `;
      if (
        user.roles.some(
          (role) => role.role === 'ADMIN' || role.role === 'FINANCE',
        )
      ) {
        await sql`
          insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at)
          values (${demoFactorId(user.email)}, ${authUserId}, 'Демо TOTP', 'totp', 'verified', ${totpSecret}, now(), now())
          on conflict (id) do update set secret = excluded.secret, status = 'verified', updated_at = now()
        `;
      }
    }
  } finally {
    await sql.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  seedDemoAuth(process.env)
    .then(() =>
      console.info('Local Supabase Auth identities for @demo users are ready'),
    )
    .catch((error: unknown) => {
      console.error(
        `Demo auth seed refused or failed (${toolErrorSummary(error)}); run pnpm db:seed first against the local stack`,
      );
      process.exitCode = 1;
    });
}
