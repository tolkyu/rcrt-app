import { z } from 'zod';
import type { WriteContext } from '../context/request-context';
import type { DbExecutor } from '../db';
import { auditLog } from '../db/schema';

const json = z.json();

const auditEntrySchema = z
  .object({
    action: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
    result: z.enum(['SUCCESS', 'DENIED']).default('SUCCESS'),
    forced: z.boolean().default(false),
    entityType: z.string().min(1).nullable().default(null),
    entityId: z.string().min(1).nullable().default(null),
    candidateId: z.uuid().nullable().default(null),
    before: json.nullable().default(null),
    after: json.nullable().default(null),
    details: z.record(z.string(), json).nullable().default(null),
  })
  .strict();
export type AuditEntry = z.input<typeof auditEntrySchema>;

/**
 * Appends one audit row inside the caller's transaction (AUD, ADR-003): actor, IP, user agent,
 * request id, before/after and the candidate correlation used by purge (DG-20).
 */
export async function writeAudit(
  tx: DbExecutor,
  ctx: WriteContext,
  entry: AuditEntry,
): Promise<bigint> {
  const data = auditEntrySchema.parse(entry);
  const actorId = ctx.auth?.userId ?? null;
  const [row] = await tx
    .insert(auditLog)
    .values({
      occurredAt: ctx.clock.now(),
      actorId,
      actorKind:
        actorId === null ? 'SYSTEM' : data.forced ? 'ADMIN_FORCE' : 'USER',
      action: data.action,
      result: data.result,
      entityType: data.entityType,
      entityId: data.entityId,
      candidateId: data.candidateId,
      before: data.before,
      after: data.after,
      details: data.details,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    })
    .returning({ id: auditLog.id });
  return row!.id;
}
