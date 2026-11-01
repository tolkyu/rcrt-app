import { describe, expect, it } from 'vitest';
import {
  assertLocalDatabase,
  parseEnv,
  parseRuntimeEnv,
  parseMigrationDatabaseUrl,
  parseLocalDatabaseTargets,
} from '@/lib/env';

const local = {
  APP_ENV: 'local',
  APP_URL: 'http://localhost:3000',
  SUPABASE_URL: 'http://127.0.0.1:55321',
  DATABASE_URL: 'postgresql://postgres:password@127.0.0.1:55322/postgres',
};

describe('local database endpoint consistency', () => {
  const source = {
    ...local,
    DATABASE_URL: 'postgresql://app_rw:password@127.0.0.1:55322/postgres',
    DATABASE_MIGRATION_URL: local.DATABASE_URL,
  };
  it('accepts matching runtime and privileged endpoints', () => {
    expect(parseLocalDatabaseTargets(source).migrationUrl).toBe(
      source.DATABASE_MIGRATION_URL,
    );
  });
  it('does not require auth-provider configuration for standalone database tooling', () => {
    expect(
      parseLocalDatabaseTargets({ ...source, SUPABASE_URL: undefined })
        .runtimeUrl,
    ).toBe(source.DATABASE_URL);
  });
  it.each([
    'postgresql://postgres:password@127.0.0.1:55332/postgres',
    'postgresql://postgres:password@127.0.0.1:55322/other_database',
  ])(
    'rejects mismatched privileged endpoint before connecting',
    (DATABASE_MIGRATION_URL) => {
      expect(() =>
        parseLocalDatabaseTargets({ ...source, DATABASE_MIGRATION_URL }),
      ).toThrow('matching database endpoints');
    },
  );
  it('rejects a missing local runtime password', () => {
    expect(() =>
      parseLocalDatabaseTargets({
        ...source,
        DATABASE_URL: 'postgresql://app_rw@127.0.0.1:55322/postgres',
      }),
    ).toThrow('app_rw password');
  });
});

const authRuntime = {
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_value_0001',
  SUPABASE_SECRET_KEY: 'sb_secret_fixture_value_000000001',
  AUTH_RATE_LIMIT_SECRET: 'fixture-rate-limit-secret-of-32-chars!',
  EMAIL_FROM: 'no-reply@fixture.test',
};

describe('runtime environment', () => {
  it('treats blank optional provider settings from .env.example as unset', () => {
    expect(
      parseRuntimeEnv({
        ...local,
        ...authRuntime,
        DATABASE_URL: 'postgresql://app_rw:password@127.0.0.1:55322/postgres',
        RESEND_API_KEY: '',
        MAILPIT_URL: 'http://127.0.0.1:55324',
      }).RESEND_API_KEY,
    ).toBeUndefined();
  });
  it('requires every sign-in secret and names only the missing variables [SEC-T4-03]', () => {
    expect(() =>
      parseRuntimeEnv({
        ...local,
        DATABASE_URL: 'postgresql://app_rw:password@127.0.0.1:55322/postgres',
      }),
    ).toThrow(
      'Invalid environment variables: SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, AUTH_RATE_LIMIT_SECRET, EMAIL_FROM',
    );
  });
  it('rejects a short rate-limit secret', () => {
    expect(() =>
      parseEnv({ ...local, AUTH_RATE_LIMIT_SECRET: 'too-short' }),
    ).toThrow('AUTH_RATE_LIMIT_SECRET');
  });
  it('requires Resend and forbids the local mail catcher on hosted environments', () => {
    const hosted = {
      ...local,
      ...authRuntime,
      APP_ENV: 'production',
      APP_URL: 'https://hiring.fixture.test',
      SUPABASE_URL: 'https://project.supabase.co',
      DATABASE_URL:
        'postgresql://app_rw:password@db.fixture.test:5432/postgres',
    };
    expect(() => parseRuntimeEnv(hosted)).toThrow('RESEND_API_KEY');
    expect(() =>
      parseRuntimeEnv({
        ...hosted,
        RESEND_API_KEY: 're_fixture_key',
        MAILPIT_URL: 'http://127.0.0.1:55324',
      }),
    ).toThrow('MAILPIT_URL');
  });
  it.each([
    [{ APP_ENV: 'production' }],
    [{ APP_ENV: 'preview' }],
    [{ VERCEL_ENV: 'production' }],
  ])(
    'refuses to boot a perf build on a hosted environment %j [DG-01]',
    (override) => {
      expect(() =>
        parseRuntimeEnv(
          {
            ...local,
            ...authRuntime,
            RESEND_API_KEY: 're_fixture_key',
            DATABASE_URL:
              'postgresql://app_rw:password@127.0.0.1:55322/postgres',
            ...override,
          },
          true,
        ),
      ).toThrow('PERF_BUILD');
    },
  );
  it('allows a perf build locally', () => {
    expect(
      parseRuntimeEnv(
        {
          ...local,
          ...authRuntime,
          DATABASE_URL: 'postgresql://app_rw:password@127.0.0.1:55322/postgres',
        },
        true,
      ).APP_ENV,
    ).toBe('local');
  });
  it('requires the auth origin at startup without printing its value', () => {
    expect(() =>
      parseRuntimeEnv({
        ...local,
        DATABASE_URL: 'postgresql://app_rw:password@127.0.0.1:55322/postgres',
        SUPABASE_URL: undefined,
      }),
    ).toThrow('Invalid environment variables: SUPABASE_URL');
  });
  it.each([
    'http://remote.example.com',
    'https://user:secret@example.com',
    'https://example.com/path',
  ])('rejects an unsafe Supabase origin', (SUPABASE_URL) => {
    expect(() => parseEnv({ ...local, SUPABASE_URL })).toThrow('SUPABASE_URL');
  });
  it.each(['app_rw', 'app_rw.project_ref'])(
    'allows only the dedicated runtime login %s',
    (username) => {
      expect(
        parseRuntimeEnv({
          ...local,
          ...authRuntime,
          DATABASE_URL: `postgresql://${username}:password@127.0.0.1:55322/postgres`,
        }).APP_ENV,
      ).toBe('local');
    },
  );
  it.each(['postgres', 'app_migrator', 'app_purge', 'app_rw_fake'])(
    'rejects runtime login %s',
    (username) => {
      expect(() =>
        parseRuntimeEnv({
          ...local,
          ...authRuntime,
          DATABASE_URL: `postgresql://${username}:password@127.0.0.1:55322/postgres`,
        }),
      ).toThrow('DATABASE_URL must use the app_rw');
    },
  );
  it.each([
    'user=postgres',
    'database=production',
    'options=-c%20role%3Dapp_migrator',
    'host=db.example.com',
  ])('rejects startup identity/target override %s', (query) => {
    expect(() =>
      parseRuntimeEnv({
        ...local,
        DATABASE_URL: `postgresql://app_rw:password@127.0.0.1:55322/postgres?${query}`,
      }),
    ).toThrow('DATABASE_URL');
  });
  it('requires a separate valid migration URL without exposing its value', () => {
    expect(() =>
      parseMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: 'secret-password' }),
    ).toThrow('Invalid environment variables: DATABASE_MIGRATION_URL');
    expect(() => parseMigrationDatabaseUrl({})).toThrow(
      'DATABASE_MIGRATION_URL',
    );
    expect(
      parseMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: local.DATABASE_URL }),
    ).toBe(local.DATABASE_URL);
  });
  it('accepts local runtime configuration', () => {
    expect(parseEnv(local).LOG_LEVEL).toBe('info');
  });
  it('reports missing names without exposing secret values', () => {
    expect(() =>
      parseEnv({
        ...local,
        APP_URL: undefined,
        DATABASE_URL: 'secret-password',
      }),
    ).toThrow('Invalid environment variables: APP_URL, DATABASE_URL');
  });
  it.each([
    'ftp://example.com',
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com?secret=value',
  ])('rejects invalid application origin %s', (APP_URL) => {
    expect(() => parseEnv({ ...local, APP_URL })).toThrow('APP_URL');
  });
  it('rejects a non-Postgres connection string', () => {
    expect(() =>
      parseEnv({ ...local, DATABASE_URL: 'https://example.com' }),
    ).toThrow('DATABASE_URL');
  });
});

describe('local database tooling guard', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'accepts loopback %s',
    (host) => {
      expect(
        assertLocalDatabase({
          ...local,
          DATABASE_URL: `postgresql://postgres:password@${host}:55322/postgres`,
        }).APP_ENV,
      ).toBe('local');
    },
  );
  it.each([
    { NODE_ENV: 'production' },
    { APP_ENV: 'preview' },
    { APP_ENV: 'production' },
    { DATABASE_URL: 'postgresql://postgres:password@db.example.com/postgres' },
    {
      DATABASE_URL:
        'postgresql://postgres:password@localhost.evil.test/postgres',
    },
    { DATABASE_URL: `${local.DATABASE_URL}?sslmode=require` },
  ])('blocks unsafe target %j', (override) => {
    expect(() => assertLocalDatabase({ ...local, ...override })).toThrow(
      'Local database tooling requires',
    );
  });
});
