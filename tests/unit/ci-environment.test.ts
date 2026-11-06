import { describe, expect, it } from 'vitest';
import { ciEnvironment } from '../../scripts/ci-env';

const status = {
  API_URL: 'http://127.0.0.1:55321',
  DB_URL: 'postgresql://postgres:local-only@127.0.0.1:55322/postgres',
  MAILPIT_URL: 'http://127.0.0.1:55324',
  PUBLISHABLE_KEY: 'local-publishable-fixture',
  SECRET_KEY: 'local-secret-fixture',
};

describe('Disposable CI environment [FND-1, SEC]', () => {
  it('uses the actual local stack and generates independent ephemeral secrets', () => {
    const first = ciEnvironment(status);
    const second = ciEnvironment(status);
    expect(new URL(first.DATABASE_URL).username).toBe('app_rw');
    expect(new URL(first.DATABASE_URL).host).toBe('127.0.0.1:55322');
    expect(first.DATABASE_MIGRATION_URL).toBe(status.DB_URL);
    expect(first.SUPABASE_SECRET_KEY).toBe(status.SECRET_KEY);
    expect(first.DEV_DEMO_TOTP_SECRET).toMatch(/^[A-Z2-7]{32}$/);
    expect(first.AUTH_RATE_LIMIT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(first.AUTH_RATE_LIMIT_SECRET).not.toBe(
      second.AUTH_RATE_LIMIT_SECRET,
    );
    expect(first.DATABASE_URL).not.toBe(second.DATABASE_URL);
  });

  it.each(['API_URL', 'DB_URL', 'MAILPIT_URL'])(
    'rejects hosted %s before exporting credentials',
    (name) =>
      expect(() =>
        ciEnvironment({ ...status, [name]: 'https://hosted.example' }),
      ).toThrow(),
  );

  it('rejects multiline status values instead of injecting GitHub environment entries', () => {
    expect(() =>
      ciEnvironment({ ...status, SECRET_KEY: 'key\nOTHER=value' }),
    ).toThrow();
  });
});
