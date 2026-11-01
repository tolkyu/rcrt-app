import { sortRoles } from '../../lib/roles';
import {
  userListQuerySchema,
  type UserListItem,
  type UserListQuery,
  type UserPage,
} from '../../lib/schemas/user';
import { requirePermission } from '../authz/can';
import { GLOBAL_ROLES } from '../authz/roles';
import type { BuiltinRole } from '../authz/types';
import type { RequestContext } from '../context/request-context';
import { countUsers, listUsers, type UserListRow } from '../repositories/user';

const asList = <T>(value: T | T[] | undefined): T[] | undefined =>
  value === undefined ? undefined : Array.isArray(value) ? value : [value];

/** 2FA column (wireframe §1.1): only activated users have a meaningful state; ADMIN/FINANCE without a factor is flagged. */
function mfaOf(row: UserListRow, now: Date): UserListItem['mfa'] {
  const base = { factors: row.factors, lockedUntil: null };
  if (row.status !== 'ACTIVE') return { ...base, state: 'NONE' };
  if (row.mfaLockedUntil && row.mfaLockedUntil > now)
    return {
      ...base,
      state: 'LOCKED',
      lockedUntil: row.mfaLockedUntil.toISOString(),
    };
  if (row.factors > 0) return { ...base, state: 'ENABLED' };
  return row.roles.some((r) => GLOBAL_ROLES.has(r.role as BuiltinRole))
    ? { ...base, state: 'REQUIRED_MISSING' }
    : { ...base, state: 'OFF' };
}

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
    roles: sortRoles(
      row.roles.map((r) => ({
        role: r.role,
        vertical:
          r.verticalId && r.verticalName
            ? { id: r.verticalId, name: r.verticalName }
            : null,
      })),
    ),
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
