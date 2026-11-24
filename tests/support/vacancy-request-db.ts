import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import postgres from 'postgres';
import {
  assertDisposableLocalData,
  parseLocalDatabaseTargets,
} from '../../lib/env';
import type { RichTextDoc } from '../../lib/schemas/rich-text';

export type StoredRequest = {
  id: string;
  status: string;
  headcount: number;
  priorityFlag: string;
  source: string;
  probationDays: number;
  recruiterInitiated: boolean;
  descriptionDoc: RichTextDoc | null;
};

/** The detail DTO and card do not show the comment yet, so the stored text is read through the loopback-guarded owner connection. */
export async function withOwner<T>(run: (sql: postgres.Sql) => Promise<T>) {
  const { migrationUrl } = parseLocalDatabaseTargets({
    ...(existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {}),
    ...process.env,
    APP_ENV: 'local',
  });
  const sql = postgres(migrationUrl, {
    prepare: false,
    max: 1,
    onnotice: () => undefined,
  });
  try {
    await assertDisposableLocalData(sql);
    return await run(sql);
  } finally {
    await sql.end();
  }
}

export const storedRequests = (marker: string) =>
  withOwner(
    (sql) => sql<StoredRequest[]>`
      select id, status, headcount, priority_flag as "priorityFlag", source,
        probation_days as "probationDays", recruiter_initiated as "recruiterInitiated",
        description_doc as "descriptionDoc"
      from app.vacancy
      where deleted_at is null and strpos(description_doc::text, ${marker}) > 0
      order by public_no`,
  );

/** An opened vacancy has no delete route, so the spec soft-deletes only the rows carrying its own marker; lists return to the seeded state. */
export const removeRequests = (marker: string) => {
  if (!/^E2E-REQ-[a-z0-9]+$/.test(marker))
    throw new Error('Refusing to remove vacancies by a non-test marker');
  return withOwner(
    (sql) => sql`
      update app.vacancy
      set deleted_at = now(), deleted_by = created_by, delete_reason = 'E2E cleanup'
      where deleted_at is null and strpos(description_doc::text, ${marker}) > 0
      returning id`,
  );
};
