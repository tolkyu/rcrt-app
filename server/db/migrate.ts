import { fileURLToPath, pathToFileURL } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';
import { parseMigrationDatabaseUrl } from '../../lib/env';
import { toolErrorSummary } from './tool-error';

/** Migrations need a privileged direct connection, separate from the runtime pooler. */
export async function migrateDatabase(databaseUrl: string): Promise<void> {
  parseMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: databaseUrl });
  const migrations = readMigrationFiles({
    migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)),
  });
  const client = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    onnotice: () => undefined,
  });
  try {
    await client.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(742918603)`;
      await tx.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle');
      await tx.unsafe('REVOKE ALL ON SCHEMA drizzle FROM PUBLIC');
      await tx.unsafe(
        'CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint NOT NULL UNIQUE)',
      );
      const applied = await tx<
        { hash: string; created_at: string }[]
      >`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
      if (applied.length > migrations.length)
        throw new Error('Database migration history is ahead of this checkout');
      for (const [i, migration] of migrations.entries()) {
        const previous = applied[i];
        if (previous) {
          if (
            Number(previous.created_at) !== migration.folderMillis ||
            previous.hash !== migration.hash
          ) {
            throw new Error(
              'Applied migration checksum does not match this checkout',
            );
          }
          continue;
        }
        if (i > 0) await tx.unsafe('SET LOCAL ROLE app_migrator');
        for (const statement of migration.sql) await tx.unsafe(statement);
        // Migration DDL uses SET LOCAL ROLE so all app objects belong to the DDL role.
        await tx.unsafe('RESET ROLE');
        await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`;
      }
    });
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const databaseUrl = process.env.DATABASE_MIGRATION_URL;
  if (!databaseUrl) {
    console.error('DATABASE_MIGRATION_URL is required');
    process.exitCode = 1;
  } else {
    migrateDatabase(databaseUrl)
      .then(() => console.info('Database migrations applied'))
      .catch((error: unknown) => {
        console.error(
          `Database migration failed (${toolErrorSummary(error)}); inspect the migration and database privileges`,
        );
        process.exitCode = 1;
      });
  }
}
