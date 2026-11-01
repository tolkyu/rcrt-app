import { z } from 'zod';
import type { WriteContext } from '../context/request-context';
import type { DbExecutor } from '../db';
import { auditLog } from '../db/schema';

const json = z.json();

/** Words that signal identifiers or free text; such values belong in purgeable before/after. */
const PII_WORDS = new Set([
  'email',
  'phone',
  'telegram',
  'name',
  'filename',
  'username',
  'fullname',
  'comment',
  'note',
  'text',
  'url',
  'link',
  'address',
  'file',
  'feedback',
  'message',
  'description',
  'terms',
  'salary',
]);

/** Whole camelCase words only (plural too), so `profileId`, `contextId`, `linkedAt` or `renamed` pass. */
export function isPiiKey(key: string): boolean {
  return key
    .split(/(?=[A-Z])|\d+/)
    .map((word) => word.toLowerCase())
    .some((word) =>
      [word, word.replace(/s$/, ''), word.replace(/es$/, '')].some((form) =>
        PII_WORDS.has(form),
      ),
    );
}
/** Detail values are codes, ids, numbers or flags; free text cannot match these shapes (SEC-CORE-07). */
const detailScalar = z.union([
  z.boolean(),
  z.number().finite(),
  z.null(),
  z.uuid(),
  z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/),
  z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
]);
const detailsSchema = z.record(
  z
    .string()
    .regex(/^[a-z][a-zA-Z0-9]{0,39}$/)
    .refine((key) => !isPiiKey(key), 'PII-like key in audit details'),
  z.union([detailScalar, z.array(detailScalar).max(50)]),
);

/** Rows about these entities must carry candidate_id so the purge procedure finds them (DG-20). */
const candidateEntities = new Set([
  'candidate',
  'application',
  'interview',
  'polygraph',
  'offer',
  'probation',
  'comment',
  'file_object',
]);

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
    details: detailsSchema.nullable().default(null),
  })
  .strict()
  .refine(
    (entry) =>
      entry.entityType === null ||
      !candidateEntities.has(entry.entityType) ||
      entry.candidateId !== null,
    {
      path: ['candidateId'],
      message: 'candidateId is required for candidate-related rows',
    },
  );
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
