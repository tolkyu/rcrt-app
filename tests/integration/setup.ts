import type { TestProject } from 'vitest/node';
import { provisionLocalRuntime } from '../../scripts/provision-local-db';
import { migrateDatabase } from '../../server/db/migrate';
import { connectTestDatabase, testDatabaseUrls } from './database';

export default async function setup(project: TestProject) {
  const urls = testDatabaseUrls({ ...process.env, ...project.config.env });
  const sql = connectTestDatabase(urls.migration);
  try {
    const [database] = await sql`
      select current_database() as name, current_setting('server_version_num')::int as version
    `;
    if (
      database?.name !== 'recruiting_test' ||
      Math.floor(database.version / 10000) !== 16
    ) {
      throw new Error(
        'Integration tests require disposable recruiting_test on PostgreSQL 16',
      );
    }
    await sql`drop schema if exists app cascade`;
    await sql`drop schema if exists drizzle cascade`;
    await sql`
      do $$ begin
        if not exists (select from pg_roles where rolname = 'anon') then
          create role anon nologin;
        end if;
        if not exists (select from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin;
        end if;
      end $$
    `;
    await migrateDatabase(urls.migration);
    await provisionLocalRuntime({
      APP_ENV: 'local',
      APP_URL: 'http://localhost:3100',
      NODE_ENV: 'test',
      DATABASE_URL: urls.runtime,
      DATABASE_MIGRATION_URL: urls.migration,
    });
  } finally {
    await sql.end();
  }
}
