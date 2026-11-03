import { z } from 'zod';
import { AUDIT_ACTION_COUNT, parseAuditActions } from '../audit-actions';
import { timeIdCursorSchema } from './cursor';
import {
  AUDIT_ACTORS_PAGE,
  AUDIT_ENTITY_TYPES,
  AUDIT_PAGE,
  AUDIT_SYSTEM_ACTOR,
  AUDIT_UNKNOWN_ACTOR_ACTION,
} from '../audit-constants';
import { USER_SEARCH_MAX, USER_SEARCH_MIN } from '../user-constants';
export {
  AUDIT_ACTION_GROUPS,
  AUDIT_ENTITY_TYPES,
  AUDIT_PERIOD_MAX_DAYS,
  AUDIT_PAGE,
  type AuditActionGroup,
  AUDIT_SYSTEM_ACTOR,
  type AuditEntityType,
} from '../audit-constants';

const kyivDate = z.iso.date();
export const AUDIT_DIRECTIONS = ['older', 'newer'] as const;
export type AuditDirection = (typeof AUDIT_DIRECTIONS)[number];

export const auditQuerySchema = z
  .object({
    view: z.enum(['all', 'security']).optional().meta({
      description:
        'Security view restricts results to auth.* or user.mfa_* actions, intersected with all other filters. Default is all.',
    }),
    from: kyivDate.optional(),
    to: kyivDate.optional(),
    actorId: z
      .union([z.uuid(), z.literal(AUDIT_SYSTEM_ACTOR)])
      .optional()
      .meta({
        description: `User id, or \`${AUDIT_SYSTEM_ACTOR}\` for system rows (\`actorKind = SYSTEM\`) except \`${AUDIT_UNKNOWN_ACTOR_ACTION}\` without an entity (unknown user).`,
      }),
    action: z
      .string()
      .regex(/^[a-z_]+\.[a-z_]+$/)
      .optional(),
    actions: z
      .string()
      .transform((value, ctx) => {
        const codes = parseAuditActions(value);
        if (codes) return codes.join(',');
        ctx.addIssue({ code: 'custom', message: 'invalid_actions' });
        return z.NEVER;
      })
      .optional()
      .meta({
        description: `Comma-separated known action codes (maximum ${AUDIT_ACTION_COUNT} before deduplication), ORed together. Cannot be combined with \`action\`.`,
      }),
    entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
    entityId: z.string().min(1).max(64).optional(),
    result: z.enum(['SUCCESS', 'DENIED']).optional(),
    cursor: timeIdCursorSchema
      .meta({
        ...timeIdCursorSchema.meta(),
        description:
          'Opaque `nextCursor` or `prevCursor` of a previous page; valid only with the filters that produced it.',
      })
      .optional(),
    direction: z.enum(AUDIT_DIRECTIONS).optional().meta({
      description:
        'Side of `cursor` to read: `older` (default, pass `nextCursor`) or `newer` (pass `prevCursor`; requires `cursor`). Items are newest first either way.',
    }),
    limit: z.coerce.number().int().min(1).max(100).default(AUDIT_PAGE),
  })
  .strict()
  .refine((query) => query.direction !== 'newer' || query.cursor, {
    path: ['cursor'],
    message: 'cursor_required',
  })
  .refine(
    (query) => query.action === undefined || query.actions === undefined,
    {
      path: ['actions'],
      message: 'action_filters_exclusive',
    },
  )
  .refine((query) => !query.entityId || query.entityType, {
    path: ['entityId'],
    message: 'entity_type_required',
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    message: 'period_reversed',
  });
export type AuditQuery = z.input<typeof auditQuerySchema>;

const actorSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  isActive: z.boolean(),
});

const entitySchema = z.object({
  type: z.string(),
  id: z.string(),
  /** Current name for users and verticals; never values from PII side tables. */
  label: z.string().nullable(),
});

export const auditEntrySchema = z
  .object({
    id: z.string(),
    occurredAt: z.iso.datetime(),
    actor: actorSchema.nullable(),
    actorKind: z.enum(['USER', 'SYSTEM', 'ADMIN_FORCE']),
    action: z.string(),
    result: z.enum(['SUCCESS', 'DENIED']),
    entity: entitySchema.nullable(),
    ip: z.string().nullable(),
  })
  .meta({ id: 'AuditEntry' });
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditPageSchema = z
  .object({
    items: z.array(auditEntrySchema),
    nextCursor: z.string().nullable().meta({
      description:
        'Older matching records exist after the last item; pass as `cursor`.',
    }),
    prevCursor: z.string().nullable().meta({
      description:
        'Newer matching records exist before the first item; pass as `cursor` with `direction=newer`. Always null without `cursor`.',
    }),
  })
  .meta({ id: 'AuditPage' });
export type AuditPage = z.infer<typeof auditPageSchema>;

/** Describe JSON without recursively expanding z.json() in the OpenAPI generator. */
const auditJsonSchema = z.json().meta({
  type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
});

export const auditRecordParamsSchema = z.object({
  recordId: z.string().regex(/^\d{1,19}$/),
});

export const auditRecordSchema = auditEntrySchema
  .extend({
    before: auditJsonSchema,
    after: auditJsonSchema,
    details: auditJsonSchema,
    userAgent: z.string().nullable(),
    requestId: z.uuid().nullable(),
    detailLabels: z.record(z.string(), z.string()).meta({
      description:
        'Current names for user ids in `details` (e.g. `teamLead`), Admin-only like entity labels.',
    }),
  })
  .meta({ id: 'AuditRecord' });
export type AuditRecord = z.infer<typeof auditRecordSchema>;

export const auditActorQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(USER_SEARCH_MIN)
      .max(USER_SEARCH_MAX)
      .optional()
      .meta({ description: 'Part of the full name or email.' }),
    /** Last row's id only, like the users list: names never travel in URLs or logs. */
    cursor: z
      .uuid()
      .optional()
      .meta({ description: 'Opaque `nextCursor` from the previous page.' }),
    limit: z.coerce.number().int().min(1).max(50).default(AUDIT_ACTORS_PAGE),
  })
  .strict();
export type AuditActorQuery = z.input<typeof auditActorQuerySchema>;

export const auditActorSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    isActive: z.boolean(),
  })
  .meta({ id: 'AuditActor' });
export type AuditActor = z.infer<typeof auditActorSchema>;

export const auditActorPageSchema = z
  .object({
    items: z.array(auditActorSchema),
    nextCursor: z.uuid().nullable(),
  })
  .meta({ id: 'AuditActorPage' });
export type AuditActorPage = z.infer<typeof auditActorPageSchema>;
