import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { z } from 'zod';

const object = z.record(z.string(), z.unknown());
const signingKeys = z.object({
  keys: z.array(z.object({ algorithm: z.string(), status: z.string() })),
});
const userSummary = z.object({
  demoUsers: z.number().int().nonnegative(),
  passwords: z.number().int().nonnegative(),
});

export function assessAuthDrift(
  configInput: unknown,
  keysInput: unknown,
  usersInput: unknown,
  expectedOrigin: string,
  googleEnabled: boolean,
) {
  const config = object.safeParse(configInput);
  const keys = signingKeys.safeParse(keysInput);
  const users = userSummary.safeParse(usersInput);
  if (!config.success || !keys.success || !users.success)
    throw new Error('Auth drift response shape is invalid');
  const origin = new URL(expectedOrigin);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== expectedOrigin ||
    origin.username ||
    origin.password
  )
    throw new Error('Auth drift expected origin must be an exact HTTPS origin');
  const failures: string[] = [];
  const equal = (name: string, value: unknown) => {
    if (config.data[name] !== value) failures.push(name);
  };
  for (const name of [
    'disable_signup',
    'external_email_enabled',
    'refresh_token_rotation_enabled',
    'mailer_secure_email_change_enabled',
    'security_update_password_require_reauthentication',
    'mfa_totp_enroll_enabled',
    'mfa_totp_verify_enabled',
  ])
    equal(name, true);
  for (const name of [
    'external_anonymous_users_enabled',
    'security_manual_linking_enabled',
    'external_phone_enabled',
    'external_google_skip_nonce_check',
    'external_google_email_optional',
    'mfa_phone_enroll_enabled',
    'mfa_phone_verify_enabled',
  ])
    equal(name, false);
  equal('external_google_enabled', googleEnabled);
  for (const [name, value] of Object.entries(config.data)) {
    if (
      /^external_.+_enabled$/.test(name) &&
      !['external_google_enabled', 'external_email_enabled'].includes(name) &&
      value !== false
    )
      failures.push(name);
  }
  equal('jwt_exp', 900);
  equal('mailer_otp_exp', 900);
  equal('site_url', expectedOrigin);
  for (const [name, maximum, minimum] of [
    ['security_refresh_token_reuse_interval', 10, 0],
    ['mfa_max_enrolled_factors', 3, 3],
  ] as const) {
    const value = config.data[name];
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    )
      failures.push(name);
  }
  for (const name of [
    'rate_limit_email_sent',
    'rate_limit_token_refresh',
    'rate_limit_verify',
    'rate_limit_otp',
  ]) {
    const value = config.data[name];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
      failures.push(name);
  }
  const redirects = config.data.uri_allow_list;
  const expected = [
    `${expectedOrigin}/auth/callback`,
    `${expectedOrigin}/auth/confirm`,
  ];
  if (
    typeof redirects !== 'string' ||
    JSON.stringify(
      redirects
        .split(',')
        .map((entry) => entry.trim())
        .sort(),
    ) !== JSON.stringify(expected)
  )
    failures.push('uri_allow_list');
  const template = config.data.mailer_templates_magic_link_content;
  if (
    typeof template !== 'string' ||
    !template.includes(
      '{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}',
    ) ||
    template.includes('.ConfirmationURL')
  )
    failures.push('mailer_templates_magic_link_content');
  if (
    typeof config.data.smtp_host !== 'string' ||
    !config.data.smtp_host.trim()
  )
    failures.push('smtp_host');
  const active = keys.data.keys.filter((key) => key.status === 'in_use');
  if (
    active.length !== 1 ||
    !active.every((key) => ['ES256', 'RS256'].includes(key.algorithm))
  )
    failures.push('active_signing_key');
  if (users.data.demoUsers !== 0) failures.push('demo_users');
  if (users.data.passwords !== 0) failures.push('password_identities');
  if (failures.length)
    throw new Error(`Auth configuration drift: ${failures.join(', ')}`);
}

async function readManagement(path: string, token: string): Promise<unknown> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${path}`, {
    headers: { authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Management API read failed');
  return response.json();
}

export async function checkHostedAuth(
  source: Record<string, string | undefined>,
) {
  const ref = source.AUTH_DRIFT_PROJECT_REF;
  const token = source.SUPABASE_ACCESS_TOKEN;
  const origin = source.AUTH_DRIFT_APP_ORIGIN;
  const databaseUrl = source.AUTH_DRIFT_DATABASE_URL;
  if (
    !ref ||
    !/^[a-z]{20}$/.test(ref) ||
    !token ||
    !origin ||
    !databaseUrl ||
    !['true', 'false'].includes(source.AUTH_DRIFT_GOOGLE_ENABLED ?? '')
  )
    throw new Error(
      'Auth drift requires explicit project, app origin, Google setting, read-only Management token and database URL',
    );
  const database = new URL(databaseUrl);
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    database.hostname !== `db.${ref}.supabase.co` ||
    database.search ||
    database.hash ||
    !database.password
  )
    throw new Error(
      'Auth drift database must use the project direct endpoint without URL options',
    );
  const sql = postgres(databaseUrl, {
    ssl: 'verify-full',
    prepare: false,
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
  });
  try {
    const [config, keys, users] = await Promise.all([
      readManagement(`${ref}/config/auth`, token),
      readManagement(`${ref}/config/auth/signing-keys`, token),
      sql.begin('read only', async (tx) => {
        await tx`set local statement_timeout = '10s'`;
        const [summary] = await tx<{ demoUsers: number; passwords: number }[]>`
          select count(*) filter (where email ~* '@(demo|fixture[.]test)$')::int as "demoUsers",
            count(*) filter (where coalesce(encrypted_password, '') <> '')::int as passwords
          from auth.users`;
        return summary;
      }),
    ]);
    assessAuthDrift(
      config,
      keys,
      users,
      origin,
      source.AUTH_DRIFT_GOOGLE_ENABLED === 'true',
    );
  } finally {
    await sql.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (!process.argv.includes('--hosted'))
      throw new Error('Auth drift hosted reads require --hosted');
    await checkHostedAuth(process.env);
    console.info(
      'Hosted Auth configuration and identity aggregate checks passed.',
    );
  } catch (error) {
    console.error(
      error instanceof Error &&
        error.message.startsWith('Auth configuration drift:')
        ? error.message
        : 'Auth drift check failed; verify configuration, read-only access and network. No response or credentials are logged.',
    );
    process.exitCode = 1;
  }
}
