import { z } from 'zod';
import { kyivDateBounds, periodDays } from '../../lib/audit-period';
import type {
  AuditActor,
  AuditActorPage,
  AuditActorQuery,
  AuditEntry,
  AuditPage,
  AuditQuery,
  AuditRecord,
} from '../../lib/schemas/audit';
import {
  AUDIT_PERIOD_MAX_DAYS,
  AUDIT_SYSTEM_ACTOR,
  auditActorQuerySchema,
  auditQuerySchema,
} from '../../lib/schemas/audit';
import {
  decodeTimeIdCursor,
  encodeTimeIdCursor,
  MAX_BIGINT_ID,
} from '../../lib/schemas/cursor';
import { requirePermission } from '../authz/can';
import type { RequestContext } from '../context/request-context';
import { NotFoundError, ValidationError } from '../http/errors';
import {
  findAuditRecord,
  findUserNames,
  listAuditEntries,
} from '../repositories/audit';
import { listUserOptions } from '../repositories/user';

/** Detail keys whose value is a user id that the record view names (`vertical.tl_priority_changed`). */
const USER_DETAIL_KEYS = ['teamLead'] as const;
const uuid = z.uuid();

/** jsonb comes back untyped; the column only ever stores JSON written by `writeAudit`. */
const storedJson = z.json().nullable();

type EntryRow = Awaited<ReturnType<typeof listAuditEntries>>[number];

function toEntry(row: EntryRow): AuditEntry {
  return {
    id: row.id.toString(),
    occurredAt: row.occurredAt.toISOString(),
    actor:
      row.actorId && row.actorName !== null && row.actorActive !== null
        ? {
            id: row.actorId,
            fullName: row.actorName,
            isActive: row.actorActive,
          }
        : null,
    actorKind: row.actorKind,
    action: row.action,
    result: row.result,
    entity:
      row.entityType && row.entityId
        ? { type: row.entityType, id: row.entityId, label: row.entityLabel }
        : null,
    ip: row.ip,
  };
}

/** «Журнал дій» (STORY-AUD-2): Admin only (audit.read, aal2); periods are Kyiv calendar dates, ≤ 1 year. */
export async function listAudit(
  ctx: RequestContext,
  input: AuditQuery,
): Promise<AuditPage> {
  requirePermission(ctx.auth, 'audit.read');
  const query = auditQuerySchema.parse(input);
  if (
    query.from &&
    query.to &&
    periodDays(query.from, query.to) > AUDIT_PERIOD_MAX_DAYS
  )
    throw new ValidationError([{ path: 'query.to', code: 'period_too_long' }]);
  const cursor = query.cursor ? decodeTimeIdCursor(query.cursor) : null;
  const bounds = kyivDateBounds(query.from, query.to);
  const actorId = query.actorId === AUDIT_SYSTEM_ACTOR ? null : query.actorId;
  const rows = await listAuditEntries(
    ctx.db,
    { ...query, ...bounds, actorId },
    cursor,
    query.limit,
  );
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toEntry),
    nextCursor:
      rows.length > query.limit && last ? encodeTimeIdCursor(last) : null,
  };
}

export async function getAuditRecord(
  ctx: RequestContext,
  recordId: string,
): Promise<AuditRecord> {
  requirePermission(ctx.auth, 'audit.read');
  const id = BigInt(recordId);
  if (id > MAX_BIGINT_ID) throw new NotFoundError();
  const row = await findAuditRecord(ctx.db, id);
  if (!row) throw new NotFoundError();
  const details = storedJson.parse(row.details ?? null);
  const userIds =
    details && typeof details === 'object' && !Array.isArray(details)
      ? USER_DETAIL_KEYS.map((key) => details[key]).filter(
          (value): value is string => uuid.safeParse(value).success,
        )
      : [];
  const names = userIds.length ? await findUserNames(ctx.db, userIds) : [];
  return {
    ...toEntry(row),
    before: storedJson.parse(row.before ?? null),
    after: storedJson.parse(row.after ?? null),
    details,
    userAgent: row.userAgent,
    requestId: row.requestId,
    detailLabels: Object.fromEntries(
      names.map((user) => [user.id, user.fullName]),
    ),
  };
}

/** «Хто» picker (wireframe settings-admin §3.1): every user who ever activated, by ПІБ or email, active first; «Система» is a fixed client option. */
export async function listAuditActors(
  ctx: RequestContext,
  input: AuditActorQuery,
): Promise<AuditActorPage> {
  requirePermission(ctx.auth, 'audit.read');
  const query = auditActorQuerySchema.parse(input);
  const rows = await listUserOptions(
    ctx.db,
    query.q,
    query.cursor ?? null,
    query.limit,
  );
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(({ id, fullName, isActive }) => ({
      id,
      fullName,
      isActive,
    })),
    nextCursor: rows.length > query.limit && last ? last.id : null,
  };
}

/** Label of a deep-linked «Хто» filter that may not be on the picker's first page; unknown ids → null. */
export async function getAuditActor(
  ctx: RequestContext,
  actorId: string,
): Promise<AuditActor | null> {
  requirePermission(ctx.auth, 'audit.read');
  if (!uuid.safeParse(actorId).success) return null;
  const [row] = await findUserNames(ctx.db, [actorId]);
  return row
    ? { id: row.id, fullName: row.fullName, isActive: row.isActive }
    : null;
}
