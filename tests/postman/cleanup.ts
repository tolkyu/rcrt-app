import postgres from 'postgres';
import {
  assertDisposableLocalData,
  parseLocalDatabaseTargets,
} from '../../lib/env';

/**
 * The Positions folder creates `Тест API <run> …` rows and the app role has no DELETE on `position`, so the local
 * owner role removes them after the run. Audit and event rows keep no foreign key to positions and stay (append-only).
 */
export async function removeThrowawayPositions(
  source: Record<string, string | undefined>,
): Promise<number> {
  // CI runs the job with APP_ENV=test; the loopback and demo-data guards still apply, so only the label is overridden.
  const { migrationUrl } = parseLocalDatabaseTargets({
    ...source,
    APP_ENV: 'local',
  });
  const sql = postgres(migrationUrl, {
    prepare: false,
    max: 1,
    onnotice: () => undefined,
  });
  try {
    await assertDisposableLocalData(sql);
    const removed = await sql`
      delete from app.position p
      where p.name like 'Тест API %'
        and not exists (select 1 from app.vacancy v where v.position_id = p.id)
      returning p.id`;
    return removed.length;
  } finally {
    await sql.end();
  }
}
