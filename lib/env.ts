import type { Sql } from 'postgres';
import { z } from 'zod';

const connectionOptions = new Set([
  'sslmode',
  'sslrootcert',
  'application_name',
  'connect_timeout',
  'idle_timeout',
  'max_lifetime',
]);
const databaseUrlSchema = z.url().superRefine((value, context) => {
  if (!URL.canParse(value)) return;
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    url.pathname.length < 2 ||
    url.hash ||
    [...url.searchParams.keys()].some((key) => !connectionOptions.has(key))
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Invalid PostgreSQL connection configuration',
    });
  }
});

const originSchema = z.url().superRefine((value, context) => {
  if (!URL.canParse(value)) return;
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    context.addIssue({ code: 'custom', message: 'Expected an HTTP origin' });
  }
  if (
    url.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'HTTPS required for remote hosts',
    });
  }
});

const schema = z.object({
  APP_ENV: z.enum(['local', 'test', 'preview', 'production']),
  APP_URL: originSchema,
  SUPABASE_URL: originSchema.optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  AUTH_RATE_LIMIT_SECRET: z.string().trim().min(32).optional(),
  AUTH_GOOGLE_ENABLED: z.enum(['true', 'false']).default('false'),
  EMAIL_FROM: z
    .string()
    .regex(/^[^\s@<>]+@[^\s@<>]+$/)
    .optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  MAILPIT_URL: originSchema.optional(),
  VERCEL_ENV: z.string().optional(),
  DATABASE_URL: databaseUrlSchema,
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export function parseEnv(source: Record<string, string | undefined>) {
  const result = schema.safeParse(
    Object.fromEntries(
      Object.entries(source).map(([name, value]) => [
        name,
        value?.trim() === '' ? undefined : value,
      ]),
    ),
  );
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Invalid environment variables: ${names.join(', ')}`);
  }
  return result.data;
}

const runtimeRequired = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'AUTH_RATE_LIMIT_SECRET',
  'EMAIL_FROM',
] as const;

/** Server boot contract: everything sign-in needs, and no local-only tool reachable from hosted builds. */
export function parseRuntimeEnv(
  source: Record<string, string | undefined>,
  perfBuild = false,
) {
  const env = parseEnv(source);
  assertRuntimeDatabaseUrl(env.DATABASE_URL);
  const missing: string[] = runtimeRequired.filter((name) => !env[name]);
  const hosted = env.APP_ENV === 'preview' || env.APP_ENV === 'production';
  if (hosted && !env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
  if (hosted && env.MAILPIT_URL) missing.push('MAILPIT_URL');
  if (missing.length)
    throw new Error(`Invalid environment variables: ${missing.join(', ')}`);
  // DG-01: a perf build carries a test-token verifier and must never boot as a hosted environment.
  if (perfBuild && (hosted || env.VERCEL_ENV === 'production'))
    throw new Error(
      'Invalid environment variables: PERF_BUILD on a hosted environment',
    );
  return {
    ...env,
    SUPABASE_URL: env.SUPABASE_URL!,
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY!,
    SUPABASE_SECRET_KEY: env.SUPABASE_SECRET_KEY!,
    AUTH_RATE_LIMIT_SECRET: env.AUTH_RATE_LIMIT_SECRET!,
    EMAIL_FROM: env.EMAIL_FROM!,
  };
}
export type RuntimeEnv = ReturnType<typeof parseRuntimeEnv>;

export function assertRuntimeDatabaseUrl(value: string | undefined) {
  const result = databaseUrlSchema.safeParse(value);
  if (!result.success)
    throw new Error('Invalid environment variables: DATABASE_URL');
  const url = new URL(result.data);
  if (!/^app_rw(?:\.[a-z0-9_-]+)?$/.test(decodeURIComponent(url.username))) {
    throw new Error(
      'Invalid environment variables: DATABASE_URL must use the app_rw runtime role',
    );
  }
  return result.data;
}

export function parseMigrationDatabaseUrl(
  source: Record<string, string | undefined>,
) {
  const result = databaseUrlSchema.safeParse(source.DATABASE_MIGRATION_URL);
  if (!result.success)
    throw new Error('Invalid environment variables: DATABASE_MIGRATION_URL');
  return result.data;
}

/** Seed and setup tooling must never target hosted data, even with a local APP_ENV. */
export function assertLocalDatabase(
  source: Record<string, string | undefined>,
) {
  const env = parseEnv(source);
  const url = new URL(env.DATABASE_URL);
  if (
    source.NODE_ENV === 'production' ||
    env.APP_ENV !== 'local' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Local database tooling requires APP_ENV=local, a loopback database host and a non-production NODE_ENV',
    );
  }
  return env;
}

export function parseLocalDatabaseTargets(
  source: Record<string, string | undefined>,
) {
  const env = assertLocalDatabase(source);
  assertRuntimeDatabaseUrl(env.DATABASE_URL);
  const migrationUrl = parseMigrationDatabaseUrl(source);
  assertLocalDatabase({ ...source, DATABASE_URL: migrationUrl });
  const runtime = new URL(env.DATABASE_URL);
  const migration = new URL(migrationUrl);
  if (
    runtime.host !== migration.host ||
    runtime.pathname !== migration.pathname ||
    runtime.username !== 'app_rw' ||
    !runtime.password
  ) {
    throw new Error(
      'Local database tools require matching database endpoints and an app_rw password',
    );
  }
  return { runtimeUrl: env.DATABASE_URL, migrationUrl };
}

const disposableEmail = '@(demo|fixture[.]test)$';

/** A tunnel makes a hosted database look like loopback; real identities prove it is not disposable. */
export async function assertDisposableLocalData(sql: Sql): Promise<void> {
  const [tables] = await sql<{ appUser: boolean; authUsers: boolean }[]>`
    select to_regclass('app.app_user') is not null as "appUser",
      to_regclass('auth.users') is not null as "authUsers"
  `;
  const checks: Promise<{ found: boolean }[]>[] = [];
  if (tables?.appUser) {
    checks.push(sql<{ found: boolean }[]>`select exists (
      select from app.app_user where email !~* ${disposableEmail}
    ) as found`);
  }
  if (tables?.authUsers) {
    checks.push(sql<{ found: boolean }[]>`select exists (
      select from auth.users where email is null or email !~* ${disposableEmail}
    ) as found`);
  }
  const results = await Promise.all(checks);
  if (results.some(([row]) => row?.found)) {
    throw new Error(
      'Local database tooling refuses a database that holds non-demo users',
    );
  }
}
