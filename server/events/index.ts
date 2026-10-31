import { z } from 'zod';
import type { WriteContext } from '../context/request-context';
import type { DbExecutor } from '../db';
import { changeFeed, entityEvent, entityEventPii } from '../db/schema';

/** Timeline event catalog (ADR-003); dotted lowercase `<entity>.<verb_past>` only. */
export const EVENT_TYPES = [
  ...[
    'created',
    'updated',
    'status_changed',
    'recruiter_assigned',
    'recruiter_unassigned',
    'bonus_amount_changed',
    'cloned',
    'deleted',
    'restored',
  ].map((v) => `vacancy.${v}` as const),
  ...[
    'created',
    'updated',
    'merged',
    'vertical_transferred',
    'deleted',
    'restored',
    'purged',
    'file_uploaded',
  ].map((v) => `candidate.${v}` as const),
  ...[
    'created',
    'stage_changed',
    'tl_accepted',
    'tl_declined',
    'routed',
    'reactivated',
    'owner_reassigned',
    'bonus_split_set',
    'moved_back',
    'force_moved',
  ].map((v) => `application.${v}` as const),
  ...[
    'scheduled',
    'updated',
    'reschedule_requested',
    'reschedule_countered',
    'reschedule_confirmed',
    'completed',
    'no_show',
  ].map((v) => `interview.${v}` as const),
  ...[
    'assigned',
    'scheduled',
    'result_recorded',
    'reviewed',
    'retake_requested',
  ].map((v) => `polygraph.${v}` as const),
  ...[
    'drafted',
    'sent',
    'email_delivered',
    'email_failed',
    'accepted',
    'declined',
    'expired',
    'superseded',
  ].map((v) => `offer.${v}` as const),
  ...['started', 'passed', 'failed', 'shortened'].map(
    (v) => `probation.${v}` as const,
  ),
  ...['snapshot_created', 'tranche_status_changed', 'adjusted'].map(
    (v) => `bonus.${v}` as const,
  ),
  'comment.added',
  ...[
    'invited',
    'invite_resent',
    'invite_revoked',
    'invite_accepted',
    'activated',
    'deactivated',
    'reactivated',
    'profile_updated',
    'role_assigned',
    'role_removed',
    'mfa_reset',
    'mfa_enrolled',
  ].map((v) => `user.${v}` as const),
  ...['created', 'renamed', 'tl_priority_changed'].map(
    (v) => `vertical.${v}` as const,
  ),
  'settings.updated',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Keys whose values are direct identifiers or free text; they belong in `entity_event_pii`, never in `payload`. */
const PII_KEYS = new Set([
  'email',
  'phone',
  'telegram',
  'linkedin',
  'linkedinUrl',
  'portfolioUrl',
  'url',
  'name',
  'fullName',
  'firstName',
  'lastName',
  'displayName',
  'comment',
  'text',
  'body',
  'note',
  'notes',
  'feedback',
  'summary',
  'reasonComment',
  'reason',
  'address',
  'filename',
  'originalFilename',
  'ip',
  'userAgent',
]);

function piiPath(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = piiPath(item, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  // `{ field, old, new }` diffs of PII fields must carry no values (ADR-003).
  if (
    typeof record.field === 'string' &&
    PII_KEYS.has(record.field) &&
    ('old' in record || 'new' in record)
  ) {
    return `${path}.${record.field}`;
  }
  for (const [key, child] of Object.entries(record)) {
    if (PII_KEYS.has(key)) return `${path}.${key}`;
    const found = piiPath(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

const json = z.json();
const eventDraftSchema = z
  .object({
    type: z.enum(EVENT_TYPES),
    subjectType: z.string().regex(/^[a-z_]+$/),
    subjectId: z.string().min(1),
    verticalId: z.uuid().nullable().default(null),
    vacancyId: z.uuid().nullable().default(null),
    candidateId: z.uuid().nullable().default(null),
    applicationId: z.uuid().nullable().default(null),
    payload: z.record(z.string(), json).superRefine((payload, issue) => {
      const path = piiPath(payload, 'payload');
      if (path)
        issue.addIssue({
          code: 'custom',
          message: `PII key in event payload: ${path}`,
        });
    }),
    pii: z.record(z.string(), json).nullable().default(null),
    sensitivity: z
      .enum(['GENERAL', 'SALARY', 'POLYGRAPH', 'BONUS'])
      .default('GENERAL'),
    forced: z.boolean().default(false),
  })
  .strict();
export type EventDraft = z.input<typeof eventDraftSchema>;

/** Appends a timeline event (and its purgeable PII side row) in the caller's transaction (HIST-01/03). */
export async function appendEvent(
  tx: DbExecutor,
  ctx: WriteContext,
  draft: EventDraft,
): Promise<bigint> {
  const data = eventDraftSchema.parse(draft);
  const actorId = ctx.auth?.userId ?? null;
  const [row] = await tx
    .insert(entityEvent)
    .values({
      occurredAt: ctx.clock.now(),
      actorId,
      actorKind:
        actorId === null ? 'SYSTEM' : data.forced ? 'ADMIN_FORCE' : 'USER',
      type: data.type,
      verticalId: data.verticalId,
      vacancyId: data.vacancyId,
      candidateId: data.candidateId,
      applicationId: data.applicationId,
      subjectType: data.subjectType,
      subjectId: data.subjectId,
      payload: { v: 1, ...data.payload },
      sensitivity: data.sensitivity,
      requestId: ctx.requestId,
    })
    .returning({ id: entityEvent.id });
  const id = row!.id;
  if (data.pii && Object.keys(data.pii).length > 0) {
    await tx.insert(entityEventPii).values({ eventId: id, data: data.pii });
  }
  return id;
}

const changeSchema = z
  .object({
    entityType: z.string().regex(/^[a-z_]+$/),
    entityId: z.uuid(),
    kind: z.string().regex(/^[a-z_]+$/),
    topic: z.union([
      z.object({ verticalId: z.uuid() }).strict(),
      z.object({ userId: z.uuid() }).strict(),
    ]),
  })
  .strict();
export type ChangeDraft = z.input<typeof changeSchema>;

/** Realtime invalidation row: opaque ids and the client mutation id only, never the actor (DG-11). */
export async function emitChange(
  tx: DbExecutor,
  ctx: WriteContext,
  draft: ChangeDraft,
): Promise<void> {
  const data = changeSchema.parse(draft);
  await tx.insert(changeFeed).values({
    entityType: data.entityType,
    entityId: data.entityId,
    kind: data.kind,
    verticalId: 'verticalId' in data.topic ? data.topic.verticalId : null,
    userId: 'userId' in data.topic ? data.topic.userId : null,
    mutationId: ctx.mutationId,
  });
}
