import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../db';
import { AUDIT_UNKNOWN_ACTOR_ACTION } from '../../lib/audit-constants';
import { appUser, auditLog, vertical } from '../db/schema';

export interface AuditFilters {
  readonly view?: 'all' | 'security' | undefined;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
  /** `null` = «Система»: SYSTEM rows minus unknown-user sign-in failures (T4-K02); both forms use `audit_log_actor_idx`. */
  readonly actorId?: string | null | undefined;
  readonly action?: string | undefined;
  readonly actions?: readonly string[] | undefined;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly result?: 'SUCCESS' | 'DENIED' | undefined;
}

const actor = alias(appUser, 'actor');
const entityUser = alias(appUser, 'entity_user');

/** Guard the UUID cast inside CASE: historical entity ids may contain non-UUID text. */
const entityUuid = sql`case when ${auditLog.entityId} ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then ${auditLog.entityId}::uuid else null::uuid end`;

const entryColumns = {
  id: auditLog.id,
  occurredAt: auditLog.occurredAt,
  actorKind: auditLog.actorKind,
  action: auditLog.action,
  result: auditLog.result,
  entityType: auditLog.entityType,
  entityId: auditLog.entityId,
  ip: auditLog.ip,
  actorId: actor.id,
  actorName: actor.fullName,
  actorActive: actor.isActive,
  entityLabel: sql<
    string | null
  >`coalesce(${entityUser.fullName}, ${vertical.name})`,
};

/** Labels come from current user/vertical names only — never from PII side tables (wireframe §3.1). */
function entryQuery(db: DbExecutor) {
  return db
    .select(entryColumns)
    .from(auditLog)
    .leftJoin(actor, eq(actor.id, auditLog.actorId))
    .leftJoin(
      entityUser,
      and(eq(auditLog.entityType, 'user'), eq(entityUser.id, entityUuid)),
    )
    .leftJoin(
      vertical,
      and(eq(auditLog.entityType, 'vertical'), eq(vertical.id, entityUuid)),
    );
}

export function listAuditEntries(
  db: DbExecutor,
  filters: AuditFilters,
  cursor: { occurredAt: Date; id: bigint } | null,
  limit: number,
) {
  const conditions: (SQL | undefined)[] = [
    filters.view === 'security'
      ? or(
          sql`starts_with(${auditLog.action}, ${'auth.'})`,
          sql`starts_with(${auditLog.action}, ${'user.mfa_'})`,
        )
      : undefined,
    filters.from ? gte(auditLog.occurredAt, filters.from) : undefined,
    filters.to ? lt(auditLog.occurredAt, filters.to) : undefined,
    filters.actorId === null
      ? and(
          isNull(auditLog.actorId),
          sql`not (${auditLog.action} = ${AUDIT_UNKNOWN_ACTOR_ACTION} and ${auditLog.entityId} is null)`,
        )
      : filters.actorId
        ? eq(auditLog.actorId, filters.actorId)
        : undefined,
    filters.action ? eq(auditLog.action, filters.action) : undefined,
    filters.actions?.length
      ? inArray(auditLog.action, [...filters.actions])
      : undefined,
    filters.entityType
      ? eq(auditLog.entityType, filters.entityType)
      : undefined,
    filters.entityId ? eq(auditLog.entityId, filters.entityId) : undefined,
    filters.result ? eq(auditLog.result, filters.result) : undefined,
    cursor
      ? or(
          lt(auditLog.occurredAt, cursor.occurredAt),
          and(
            eq(auditLog.occurredAt, cursor.occurredAt),
            lt(auditLog.id, cursor.id),
          ),
        )
      : undefined,
  ];
  return entryQuery(db)
    .where(and(...conditions))
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
    .limit(limit + 1);
}

/** Current names of users referenced from audit details or the «Хто» filter; same source as entity labels (wireframe §3.1). */
export function findUserNames(db: DbExecutor, ids: readonly string[]) {
  return db
    .select({
      id: appUser.id,
      fullName: appUser.fullName,
      isActive: appUser.isActive,
    })
    .from(appUser)
    .where(inArray(appUser.id, [...ids]));
}

export async function findAuditRecord(db: DbExecutor, id: bigint) {
  const [[entry], [payload]] = await Promise.all([
    entryQuery(db).where(eq(auditLog.id, id)).limit(1),
    db
      .select({
        before: auditLog.before,
        after: auditLog.after,
        details: auditLog.details,
        userAgent: auditLog.userAgent,
        requestId: auditLog.requestId,
      })
      .from(auditLog)
      .where(eq(auditLog.id, id))
      .limit(1),
  ]);
  return entry && payload ? { ...entry, ...payload } : null;
}
