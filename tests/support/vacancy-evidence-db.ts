import { withOwner } from './vacancy-request-db';

/** Rows written about one vacancy; a press on «Поділитися» must leave both counts as they were (STORY-UI-09-1). */
export const vacancyRecordCounts = (vacancyId: string) =>
  withOwner(async (sql) => {
    const [events, audits] = await Promise.all([
      sql<{ count: number }[]>`
        select count(*)::int as count from app.entity_event where vacancy_id = ${vacancyId}`,
      sql<{ count: number }[]>`
        select count(*)::int as count from app.audit_log
        where entity_type = 'vacancy' and entity_id = ${vacancyId}`,
    ]);
    return { events: events[0]!.count, audits: audits[0]!.count };
  });
