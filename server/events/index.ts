import { z } from 'zod';
import { USER_PROFILE_FIELDS } from '../../lib/user-constants';
import type { WriteContext } from '../context/request-context';
import type { DbExecutor } from '../db';
import { changeFeed, entityEvent, entityEventPii } from '../db/schema';

const id = z.uuid();
const roleRef = z
  .object({
    role: z.string().regex(/^(?:[A-Z_]+|custom:[a-z0-9_]+)$/),
    verticalId: id.nullable(),
  })
  .strict();
const priority = z.number().int().min(0).nullable();
const settingField = z.enum([
  'offerValidityDays',
  'routingRejectionCooldownDays',
  'sourcingOwnershipWindowDays',
  'retentionRejectedMonths',
]);
const empty = z.object({}).strict();

/** Subject type of every user event; the user timeline is keyed on it (HIST-03). */
export const USER_SUBJECT = 'app_user';

/**
 * Allowlisted payload per event type (ADR-003, SEC-CORE-07): ids, enums, numbers only, unknown keys
 * rejected. Names, emails and free text go to `pii` (entity_event_pii, purgeable). An event type is
 * writable only once its schema is defined here; later phases add theirs with their first writer.
 */
export const EVENT_PAYLOADS = {
  'user.invited': z
    .object({ inviteId: id, roles: z.array(roleRef).min(1) })
    .strict(),
  'user.invite_resent': z.object({ inviteId: id }).strict(),
  'user.invite_revoked': z.object({ inviteId: id }).strict(),
  'user.invite_accepted': z.object({ inviteId: id }).strict(),
  'user.activated': empty,
  'user.deactivated': empty,
  'user.reactivated': z.object({ restoredRoles: z.array(roleRef) }).strict(),
  'user.profile_updated': z
    .object({
      fields: z.array(z.enum(USER_PROFILE_FIELDS)).min(1),
    })
    .strict(),
  'user.role_assigned': roleRef,
  'user.role_removed': roleRef,
  'user.mfa_enrolled': empty,
  'user.mfa_reset': empty,
  'vertical.created': empty,
  'vertical.renamed': empty,
  'vertical.tl_priority_changed': z
    .object({ userId: id, old: priority, new: priority })
    .strict(),
  'settings.updated': z
    .object({
      changes: z
        .array(
          z
            .object({
              field: settingField,
              old: z.number().int().nullable(),
              new: z.number().int().nullable(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
} as const satisfies Record<string, z.ZodType<Record<string, unknown>>>;

export type EventType = keyof typeof EVENT_PAYLOADS;
export const EVENT_TYPES = Object.keys(EVENT_PAYLOADS) as EventType[];

const json = z.json();
const envelopeSchema = z
  .object({
    type: z.enum(EVENT_TYPES as [EventType, ...EventType[]]),
    subjectType: z.string().regex(/^[a-z_]+$/),
    subjectId: z.string().min(1),
    verticalId: id.nullable().default(null),
    vacancyId: id.nullable().default(null),
    candidateId: id.nullable().default(null),
    applicationId: id.nullable().default(null),
    payload: z.unknown(),
    pii: z.record(z.string(), json).nullable().default(null),
    sensitivity: z
      .enum(['GENERAL', 'SALARY', 'POLYGRAPH', 'BONUS'])
      .default('GENERAL'),
    forced: z.boolean().default(false),
  })
  .strict();

export type EventDraft<T extends EventType = EventType> = Omit<
  z.input<typeof envelopeSchema>,
  'type' | 'payload'
> & {
  readonly type: T;
  readonly payload: z.input<(typeof EVENT_PAYLOADS)[T]>;
};

/** Appends a timeline event (and its purgeable PII side row) in the caller's transaction (HIST-01/03). */
export async function appendEvent<T extends EventType>(
  tx: DbExecutor,
  ctx: WriteContext,
  draft: EventDraft<T>,
): Promise<bigint> {
  const data = envelopeSchema.parse(draft);
  const payload = EVENT_PAYLOADS[data.type].parse(data.payload);
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
      payload: { v: 1, ...payload },
      sensitivity: data.sensitivity,
      requestId: ctx.requestId,
    })
    .returning({ id: entityEvent.id });
  const eventId = row!.id;
  if (data.pii && Object.keys(data.pii).length > 0) {
    await tx.insert(entityEventPii).values({ eventId, data: data.pii });
  }
  return eventId;
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
