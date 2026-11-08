import postgres from 'postgres';

export const phaseOneTables = [
  'app_setting',
  'app_user',
  'audit_log',
  'change_feed',
  'entity_event',
  'entity_event_pii',
  'file_object',
  'job_run',
  'position',
  'rate_limit_bucket',
  'saved_filter',
  'team_lead_priority',
  'user_invite',
  'user_role',
  'user_session',
  'vacancy',
  'vacancy_recruiter',
  'vertical',
] as const;

/** Reset permissions apply only to the dedicated disposable test database. */
export function testDatabaseUrls(
  source: Record<string, string | undefined> = process.env,
) {
  function validate(name: string, username: string) {
    const value = source[name];
    if (!value || !URL.canParse(value)) {
      throw new Error(`Required dedicated test database URL: ${name}`);
    }
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/recruiting_test' ||
      decodeURIComponent(url.username) !== username ||
      !url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(`Unsafe dedicated test database URL: ${name}`);
    }
    return { value, url };
  }
  const migration = validate('TEST_DATABASE_URL', 'recruiting_test');
  const runtime = validate('TEST_DATABASE_RUNTIME_URL', 'app_rw');
  if (
    migration.url.hostname !== runtime.url.hostname ||
    migration.url.port !== runtime.url.port
  ) {
    throw new Error('Dedicated test database URLs must target the same server');
  }
  return { migration: migration.value, runtime: runtime.value };
}

export function connectTestDatabase(url: string) {
  return postgres(url, { max: 1, prepare: false, onnotice: () => {} });
}
