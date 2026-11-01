import { z } from 'zod';
import { timeIdCursorSchema } from './cursor';
import { AUDIT_ENTITY_TYPES, AUDIT_PAGE } from '../audit-constants';
export {
  AUDIT_ACTION_GROUPS,
  AUDIT_ENTITY_TYPES,
  AUDIT_PERIOD_MAX_DAYS,
  AUDIT_PAGE,
  type AuditActionGroup,
  type AuditEntityType,
} from '../audit-constants';

const kyivDate = z.iso.date();

export const auditQuerySchema = z
  .object({
    from: kyivDate.optional(),
    to: kyivDate.optional(),
    actorId: z.uuid().optional(),
    action: z
      .string()
      .regex(/^[a-z_]+\.[a-z_]+$/)
      .optional(),
    entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
    entityId: z.string().min(1).max(64).optional(),
    result: z.enum(['SUCCESS', 'DENIED']).optional(),
    cursor: timeIdCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(AUDIT_PAGE),
  })
  .strict()
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
    nextCursor: z.string().nullable(),
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
  })
  .meta({ id: 'AuditRecord' });
export type AuditRecord = z.infer<typeof auditRecordSchema>;
