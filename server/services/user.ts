import { sortRoles } from '../../lib/roles';
import {
  decodeTimeIdCursor,
  encodeTimeIdCursor,
} from '../../lib/schemas/cursor';
import {
  userEventsQuerySchema,
  userListQuerySchema,
  type UserDetail,
  type UserEventPage,
  type UserEventsQuery,
  type UserListItem,
  type UserListQuery,
  type UserPage,
} from '../../lib/schemas/user';
import { hasAnyGrant, requirePermission } from '../authz/can';
import { GLOBAL_ROLES } from '../authz/roles';
import type { BuiltinRole } from '../authz/types';
import type { RequestContext } from '../context/request-context';
import { userIdOf } from '@/server/http/params';
import { NotFoundError } from '../http/errors';
import {
  countUsers,
  findUserDetail,
  listUserEvents,
  listUsers,
  userExists,
  type UserListRow,
} from '../repositories/user';
import { userEventView } from './user-timeline';

const asList = <T>(value: T | T[] | undefined): T[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

const requiresMfa = (roles: readonly { role: string }[]) =>
  roles.some((r) => GLOBAL_ROLES.has(r.role as BuiltinRole));

/** 2FA column (wireframe §1.1): only activated users have a meaningful state; ADMIN/FINANCE without a factor is flagged. */
function mfaOf(
  row: Pick<UserListRow, 'status' | 'mfaLockedUntil' | 'factors' | 'roles'>,
  now: Date,
): UserListItem['mfa'] {
  const base = { factors: row.factors, lockedUntil: null };
  if (row.status !== 'ACTIVE') return { ...base, state: 'NONE' };
  if (row.mfaLockedUntil && row.mfaLockedUntil > now)
    return {
      ...base,
      state: 'LOCKED',
      lockedUntil: row.mfaLockedUntil.toISOString(),
    };
  if (row.factors > 0) return { ...base, state: 'ENABLED' };
  return requiresMfa(row.roles)
    ? { ...base, state: 'REQUIRED_MISSING' }
    : { ...base, state: 'OFF' };
}

const rolesOf = (rows: UserListRow['roles']) =>
  sortRoles(
    rows.map((r) => ({
      role: r.role,
      vertical:
        r.verticalId && r.verticalName
          ? { id: r.verticalId, name: r.verticalName }
          : null,
    })),
  );

function toItem(row: UserListRow, now: Date): UserListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    status: row.status,
    inviteExpiresAt:
      row.status === 'INVITED' || row.status === 'INVITE_EXPIRED'
        ? (row.inviteExpiresAt?.toISOString() ?? null)
        : null,
    roles: rolesOf(row.roles),
    mfa: mfaOf(row, now),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

/** «Користувачі та ролі» (STORY-ROLE-05-4): Admin only (aal2); active users first, ПІБ in Ukrainian order. */
export async function listUserPage(
  ctx: RequestContext,
  input: UserListQuery,
): Promise<UserPage> {
  requirePermission(ctx.auth, 'settings.users.manage');
  const query = userListQuerySchema.parse(input);
  const filters = {
    search: query.q,
    statuses: asList(query.status),
    roles: asList(query.role),
    verticals: asList(query.vertical),
  };
  const now = ctx.clock.now();
  const [rows, total] = await Promise.all([
    listUsers(ctx.db, filters, query.cursor ?? null, query.limit, now),
    query.cursor ? null : countUsers(ctx.db, filters, now),
  ]);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => toItem(row, now)),
    total,
    nextCursor: rows.length > query.limit && last ? last.id : null,
  };
}

const INVITE_STATUSES = new Set(['INVITED', 'INVITE_EXPIRED', 'REVOKED']);
/** «Картка користувача» (STORY-ROLE-05-4 AC2): Admin only (aal2); unknown or malformed id → 404. */
export async function getUserDetail(
  ctx: RequestContext,
  rawUserId: string,
): Promise<UserDetail> {
  requirePermission(ctx.auth, 'settings.users.manage');
  const userId = userIdOf(rawUserId);
  if (!userId) throw new NotFoundError();
  const now = ctx.clock.now();
  const row = await findUserDetail(ctx.db, userId, now);
  if (!row) throw new NotFoundError();
  const iso = (value: Date | null) => value?.toISOString() ?? null;
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    activatedAt: iso(row.activatedAt),
    deactivatedAt: iso(row.deactivatedAt),
    lastLoginAt: iso(row.lastLoginAt),
    roles: rolesOf(row.roles),
    teamLeadPriorities: hasAnyGrant(ctx.auth, 'settings.priorities.manage')
      ? row.priorities.map((p) => ({
          vertical: { id: p.verticalId, name: p.verticalName },
          priority: p.priority,
        }))
      : [],
    invitation:
      INVITE_STATUSES.has(row.status) && row.inviteSentAt && row.inviteExpiresAt
        ? {
            sentAt: row.inviteSentAt.toISOString(),
            expiresAt: row.inviteExpiresAt.toISOString(),
            resendCount: row.inviteResendCount ?? 0,
            revokedAt: iso(row.inviteRevokedAt),
            revokedBy:
              row.inviteRevokedById &&
              row.inviteRevokedByName !== null &&
              row.inviteRevokedByActive !== null
                ? {
                    id: row.inviteRevokedById,
                    fullName: row.inviteRevokedByName,
                    isActive: row.inviteRevokedByActive,
                  }
                : null,
          }
        : null,
    mfa: mfaOf(row, now),
    mfaRequired: requiresMfa(row.roles),
    version: row.version,
  };
}

/** «Історія» tab (HIST-03): the user's own events, newest first, allowlisted summaries only — no IP/UA, no PII. */
export async function listUserEventPage(
  ctx: RequestContext,
  rawUserId: string,
  input: UserEventsQuery,
): Promise<UserEventPage> {
  requirePermission(ctx.auth, 'settings.users.manage');
  const query = userEventsQuerySchema.parse(input);
  const userId = userIdOf(rawUserId);
  if (!userId) throw new NotFoundError();
  const cursor = query.cursor ? decodeTimeIdCursor(query.cursor) : null;
  const [exists, rows] = await Promise.all([
    userExists(ctx.db, userId),
    listUserEvents(ctx.db, userId, cursor, query.limit),
  ]);
  if (!exists) throw new NotFoundError();
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(userEventView),
    nextCursor:
      rows.length > query.limit && last ? encodeTimeIdCursor(last) : null,
  };
}
