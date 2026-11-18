import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { entityEvent, entityEventPii } from '../db/schema';

async function latestCancelReason(
  db: DbExecutor,
  vacancyId: string,
  visible: SQL,
  cancelledBy?: string,
): Promise<string | null> {
  const [row] = await db
    .select({ reason: sql<string | null>`${entityEventPii.data}->>'reason'` })
    .from(entityEvent)
    .innerJoin(entityEventPii, eq(entityEventPii.eventId, entityEvent.id))
    .where(
      and(
        eq(entityEvent.vacancyId, vacancyId),
        eq(entityEvent.type, 'vacancy.status_changed'),
        cancelledBy === undefined
          ? undefined
          : eq(entityEvent.actorId, cancelledBy),
        visible,
        sql`${entityEvent.payload}->>'to' = 'CANCELLED'`,
      ),
    )
    .orderBy(desc(entityEvent.id))
    .limit(1);
  return row?.reason ?? null;
}

/** Author-only (D123): keyed on the cancelling user and filtered by `visible` = `vacancyEventReadWhere` (D92). */
export const findCancelReason = (
  db: DbExecutor,
  vacancyId: string,
  cancelledBy: string,
  visible: SQL,
) => latestCancelReason(db, vacancyId, visible, cancelledBy);

/** Published vacancy (D130-4): every reader of the vacancy sees the reason, so it is keyed on the vacancy and filtered only by `visible`. */
export const findCancelReasonOfVacancy = (
  db: DbExecutor,
  vacancyId: string,
  visible: SQL,
) => latestCancelReason(db, vacancyId, visible);
