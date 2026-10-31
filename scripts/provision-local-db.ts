import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { parseLocalDatabaseTargets } from '../lib/env';
import { toolErrorSummary } from '../server/db/tool-error';

export async function provisionLocalRuntime(
  source: Record<string, string | undefined>,
) {
  const { runtimeUrl, migrationUrl } = parseLocalDatabaseTargets(source);
  const runtime = new URL(runtimeUrl);

  const sql = postgres(migrationUrl, {
    prepare: false,
    max: 1,
    onnotice: () => {},
  });
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('hris.runtime_password', ${decodeURIComponent(runtime.password)}, true)`;
      await tx.unsafe(`do $$ begin
        execute format('alter role app_rw login password %L', current_setting('hris.runtime_password'));
      end $$`);
    });
  } finally {
    await sql.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await provisionLocalRuntime(process.env);
    console.log('Local app_rw login provisioned.');
  } catch (error) {
    console.error(
      `Local database role provisioning failed (${toolErrorSummary(error)}). Check the local URLs and run migrations first.`,
    );
    process.exitCode = 1;
  }
}
