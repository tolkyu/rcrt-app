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

describe('runtime environment', () => {
  it.each(['app_rw', 'app_rw.project_ref'])(
    'allows only the dedicated runtime login %s',
    (username) => {
      expect(
        parseRuntimeEnv({
          ...local,
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
