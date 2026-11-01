import { z } from 'zod';
import { BUILTIN_ROLE_CODES } from '../../server/authz/types';
import { timeIdCursorSchema } from './cursor';
import {
  GLOBAL_VERTICAL,
  USER_EVENTS_PAGE,
  USER_MFA_STATES,
  USER_PROFILE_FIELDS,
  USER_SEARCH_MAX,
  USER_SEARCH_MIN,
  USER_STATUSES,
  USERS_PAGE,
} from '../user-constants';
export {
  GLOBAL_VERTICAL,
  USER_EVENTS_PAGE,
  USER_MFA_STATES,
  USER_SEARCH_MAX,
  USER_SEARCH_MIN,
  USER_STATUSES,
  USERS_PAGE,
  type UserStatus,
} from '../user-constants';

/** The cursor is the last row's id only: names never travel in URLs or request logs (no PII in logs). */
export const userCursorSchema = z.uuid();

const oneOrMany = <T extends z.ZodType>(item: T) =>
  z.union([item, z.array(item).max(10)]).optional();

export const userListQuerySchema = z
  .object({
    q: z.string().trim().min(USER_SEARCH_MIN).max(USER_SEARCH_MAX).optional(),
    status: oneOrMany(z.enum(USER_STATUSES)),
    role: oneOrMany(z.enum(BUILTIN_ROLE_CODES)),
    vertical: oneOrMany(z.union([z.uuid(), z.literal(GLOBAL_VERTICAL)])),
    cursor: userCursorSchema
      .optional()
      .meta({ description: 'Opaque `nextCursor` from the previous page.' }),
    limit: z.coerce.number().int().min(1).max(100).default(USERS_PAGE),
  })
  .strict();
export type UserListQuery = z.input<typeof userListQuerySchema>;

const verticalRefSchema = z.object({ id: z.uuid(), name: z.string() });
const roleViewSchema = z.object({
  role: z.string(),
  vertical: verticalRefSchema.nullable(),
});
const userMfaSchema = z.object({
  state: z.enum(USER_MFA_STATES),
  factors: z.number().int().nonnegative(),
  lockedUntil: z.iso.datetime().nullable(),
});

export const userListItemSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    email: z.string(),
    status: z.enum(USER_STATUSES),
    /** Pending invite expiry for `INVITED` / `INVITE_EXPIRED`, else null. */
    inviteExpiresAt: z.iso.datetime().nullable(),
    roles: z.array(roleViewSchema),
    mfa: userMfaSchema,
    lastLoginAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'UserListItem' });
export type UserListItem = z.infer<typeof userListItemSchema>;

export const userPageSchema = z
  .object({
    items: z.array(userListItemSchema),
    total: z.number().int().nonnegative().nullable().meta({
      description:
        'Matching users on the first page; null on cursor pages (unchanged filters, no recount).',
    }),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'UserPage' });
export type UserPage = z.infer<typeof userPageSchema>;

/** Any string reaches the service, so a malformed id answers 404 exactly like an unknown one (VIS-02). */
export const userParamsSchema = z
  .object({
    userId: z.string().max(64).meta({ description: 'User id (uuid).' }),
  })
  .strict();

const personSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  isActive: z.boolean(),
});

export const userDetailSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    email: z.string(),
    status: z.enum(USER_STATUSES),
    createdAt: z.iso.datetime(),
    activatedAt: z.iso.datetime().nullable(),
    deactivatedAt: z.iso.datetime().nullable(),
    lastLoginAt: z.iso.datetime().nullable(),
    roles: z.array(roleViewSchema),
    teamLeadPriorities: z
      .array(
        z.object({
          vertical: verticalRefSchema,
          priority: z.number().int().nonnegative().nullable(),
        }),
      )
      .meta({
        description:
          'One row per TEAM_LEAD vertical (priority null = not set); empty without `settings.priorities.manage`.',
      }),
    invitation: z
      .object({
        sentAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
        resendCount: z.number().int().nonnegative(),
        revokedAt: z.iso.datetime().nullable(),
        revokedBy: personSchema.nullable(),
      })
      .nullable()
      .meta({
        description:
          'Latest invite for `INVITED`, `INVITE_EXPIRED` and `REVOKED`; null otherwise.',
      }),
    mfa: userMfaSchema,
    /** True when one of the roles (Адміністратор, Фінансист) makes 2FA mandatory. */
    mfaRequired: z.boolean(),
  })
  .meta({ id: 'UserDetail' });
export type UserDetail = z.infer<typeof userDetailSchema>;

export const userEventsQuerySchema = z
  .object({
    cursor: timeIdCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(USER_EVENTS_PAGE),
  })
  .strict();
export type UserEventsQuery = z.input<typeof userEventsQuerySchema>;

export const userEventSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    occurredAt: z.iso.datetime(),
    actorKind: z.enum(['USER', 'SYSTEM', 'ADMIN_FORCE']),
    actor: personSchema.nullable(),
    roles: z
      .array(
        roleViewSchema.extend({
          vertical: z
            .object({ id: z.uuid(), name: z.string().nullable() })
            .nullable(),
        }),
      )
      .nullable()
      .meta({
        description: 'Roles invited with, assigned, removed or restored.',
      }),
    fields: z.array(z.enum(USER_PROFILE_FIELDS)).nullable().meta({
      description: 'Changed profile fields; values are never exposed.',
    }),
  })
  .meta({ id: 'UserEvent' });
export type UserEvent = z.infer<typeof userEventSchema>;

export const userEventPageSchema = z
  .object({
    items: z.array(userEventSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'UserEventPage' });
export type UserEventPage = z.infer<typeof userEventPageSchema>;
