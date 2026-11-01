import { z } from 'zod';
import { BUILTIN_ROLE_CODES } from '../../server/authz/types';
import {
  GLOBAL_VERTICAL,
  USER_MFA_STATES,
  USER_SEARCH_MAX,
  USER_SEARCH_MIN,
  USER_STATUSES,
  USERS_PAGE,
} from '../user-constants';
export {
  GLOBAL_VERTICAL,
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

export const userListItemSchema = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    email: z.string(),
    status: z.enum(USER_STATUSES),
    /** Pending invite expiry for `INVITED` / `INVITE_EXPIRED`, else null. */
    inviteExpiresAt: z.iso.datetime().nullable(),
    roles: z.array(
      z.object({
        role: z.string(),
        vertical: z.object({ id: z.uuid(), name: z.string() }).nullable(),
      }),
    ),
    mfa: z.object({
      state: z.enum(USER_MFA_STATES),
      factors: z.number().int().nonnegative(),
      lockedUntil: z.iso.datetime().nullable(),
    }),
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
