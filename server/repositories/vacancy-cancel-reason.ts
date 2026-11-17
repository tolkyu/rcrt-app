import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { entityEvent, entityEventPii } from '../db/schema';

/** Author-only (D123): keyed on the cancelling user and filtered by `visible` = `vacancyEventReadWhere` (D92). */
export async function findCancelReason(
  db: DbExecutor,
  vacancyId: string,
  cancelledBy: string,
  visible: SQL,
): Promise<string | null> {
  const [row] = await db
    .select({ reason: sql<string | null>`${entityEventPii.data}->>'reason'` })
    .from(entityEvent)
    .innerJoin(entityEventPii, eq(entityEventPii.eventId, entityEvent.id))
    .where(
      and(
        eq(entityEvent.vacancyId, vacancyId),
        eq(entityEvent.type, 'vacancy.status_changed'),
        eq(entityEvent.actorId, cancelledBy),
        visible,
        sql`${entityEvent.payload}->>'to' = 'CANCELLED'`,
      ),
    )
    .orderBy(desc(entityEvent.id))
    .limit(1);
  return row?.reason ?? null;
}
