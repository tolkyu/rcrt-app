import { and, asc, eq, isNotNull, like, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  GLOBAL_VERTICAL,
  USER_STATUSES,
  type UserStatus,
} from '../../lib/schemas/user';
import type { DbExecutor } from '../db';
import {
  appUser,
  authMfaTotp,
  entityEvent,
  teamLeadPriority,
  userInvite,
  userRole,
  vertical,
} from '../db/schema';
import { USER_SUBJECT } from '../events';
import { otherActiveAdminExists } from './user-roles';

export async function findUserProfile(db: DbExecutor, userId: string) {
  const [row] = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      fullName: appUser.fullName,
      timezone: appUser.timezone,
    })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  return row ?? null;
}

/** Role assignments with vertical names for display only (`/me`); authorization uses AuthContext grants. */
export function findUserRoleAssignments(db: DbExecutor, userId: string) {
  return db
    .select({
      role: userRole.role,
      verticalId: vertical.id,
      verticalName: vertical.name,
    })
    .from(userRole)
    .leftJoin(vertical, eq(vertical.id, userRole.verticalId))
    .where(eq(userRole.userId, userId))
    .orderBy(asc(userRole.role), asc(vertical.name));
}

/** Local dev login only (DEV-1): active, linked `@demo` users and their roles, one row per role. */
export function listDemoUsersWithRoles(db: DbExecutor) {
  return db
    .select({
      email: appUser.email,
      fullName: appUser.fullName,
      role: userRole.role,
      vertical: vertical.name,
    })
    .from(appUser)
    .leftJoin(userRole, eq(userRole.userId, appUser.id))
    .leftJoin(vertical, eq(vertical.id, userRole.verticalId))
    .where(
      and(
        like(appUser.email, '%@demo'),
        eq(appUser.isActive, true),
        isNotNull(appUser.authUserId),
      ),
    )
    .orderBy(asc(appUser.email), asc(userRole.role));
}

export async function findActiveDemoUser(db: DbExecutor, email: string) {
  const [row] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(
      and(
        eq(appUser.email, email),
        like(appUser.email, '%@demo'),
        eq(appUser.isActive, true),
        isNotNull(appUser.authUserId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface UserListFilters {
  readonly search?: string | undefined;
  readonly statuses?: readonly UserStatus[] | undefined;
  readonly roles?: readonly string[] | undefined;
  /** Vertical ids and/or `GLOBAL`; combined with `roles` on the same assignment. */
  readonly verticals?: readonly string[] | undefined;
}

const instant = z.coerce.date();
const userListRowSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  email: z.string(),
  status: z.enum(USER_STATUSES),
  inviteExpiresAt: instant.nullable(),
  lastLoginAt: instant.nullable(),
  mfaLockedUntil: instant.nullable(),
  factors: z.number().int(),
  roles: z.array(
    z.object({
      role: z.string(),
      verticalId: z.uuid().nullable(),
      verticalName: z.string().nullable(),
    }),
  ),
});
export type UserListRow = z.infer<typeof userListRowSchema>;

/** Derived, never stored: deactivation wins, then activation, then the one pending invite (ROLE-05-3/4). */
function statusExpr(at: string) {
  return sql`case
    when not u.is_active then 'DEACTIVATED'
    when u.activated_at is not null then 'ACTIVE'
    when i.expires_at > ${at}::timestamptz then 'INVITED'
    when i.expires_at is not null then 'INVITE_EXPIRED'
    else 'REVOKED' end`;
}

const fromUsers = sql`from ${appUser} u
  left join ${userInvite} i on i.user_id = u.id and i.status = 'PENDING'`;

/** «Пошук за ПІБ або email» over `app_user u`; LIKE wildcards in the input are literal. */
function userSearchMatch(search: string): SQL {
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  return sql`(u.full_name ilike ${pattern} or u.email ilike ${pattern})`;
}

/** Keyset after a row in list order on `app_user_list_idx`; the sort key is read from the row itself. */
function afterUser(afterId: string): SQL {
  return sql`(not u.is_active, u.full_name collate "uk-UA-x-icu", u.id) >
    (select not c.is_active, c.full_name collate "uk-UA-x-icu", c.id
      from ${appUser} c where c.id = ${afterId}::uuid)`;
}

const userListOrder = sql`order by not u.is_active, u.full_name collate "uk-UA-x-icu", u.id`;

function whereFilters(filters: UserListFilters, at: string): SQL[] {
  const conditions: SQL[] = [];
  if (filters.search) conditions.push(userSearchMatch(filters.search));
  if (filters.statuses?.length)
    conditions.push(
      sql`(${statusExpr(at)}) in (${sql.join(
        filters.statuses.map((status) => sql`${status}`),
        sql`, `,
      )})`,
    );
  const roles = filters.roles ?? [];
  const verticals = filters.verticals ?? [];
  if (roles.length || verticals.length) {
    const ids = verticals.filter((id) => id !== GLOBAL_VERTICAL);
    const scope = [
      ...(ids.length
        ? [
            sql`r.vertical_id in (${sql.join(
              ids.map((id) => sql`${id}::uuid`),
              sql`, `,
            )})`,
          ]
        : []),
      ...(verticals.includes(GLOBAL_VERTICAL)
        ? [sql`r.vertical_id is null`]
        : []),
    ];
    conditions.push(sql`exists (select 1 from ${userRole} r
      where r.user_id = u.id
      ${
        roles.length
          ? sql`and r.role in (${sql.join(
              roles.map((role) => sql`${role}`),
              sql`, `,
            )})`
          : sql``
      }
      ${scope.length ? sql`and (${sql.join(scope, sql` or `)})` : sql``})`);
  }
  return conditions;
}

const whereClause = (conditions: SQL[]) =>
  conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;

/** One query per page in list order; `limit + 1` rows tell the caller whether a next page exists. */
export async function listUsers(
  db: DbExecutor,
  filters: UserListFilters,
  /** Id of the last row of the previous page; its current sort key is read in the same query. */
  afterId: string | null,
  limit: number,
  now: Date,
): Promise<UserListRow[]> {
  const at = now.toISOString();
  const conditions = whereFilters(filters, at);
  if (afterId) conditions.push(afterUser(afterId));
  const rows = await db.execute(sql`
    select u.id, u.full_name as "fullName", u.email,
      ${statusExpr(at)} as status,
      i.expires_at as "inviteExpiresAt",
      u.last_login_at as "lastLoginAt",
      u.mfa_locked_until as "mfaLockedUntil",
      (select count(*)::int from ${authMfaTotp} f where f.user_id = u.auth_user_id) as factors,
      coalesce((
        select json_agg(json_build_object('role', r.role, 'verticalId', v.id, 'verticalName', v.name))
        from ${userRole} r left join ${vertical} v on v.id = r.vertical_id
        where r.user_id = u.id
      ), '[]'::json) as roles
    ${fromUsers}
    ${whereClause(conditions)}
    ${userListOrder}
    limit ${limit + 1}
  `);
  return z.array(userListRowSchema).parse([...rows]);
}

const userOptionRowSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  isActive: z.boolean(),
});

/** Users who ever activated (only they can act), in users-list order: same search, keyset and index; `limit + 1` rows. */
export async function listUserOptions(
  db: DbExecutor,
  search: string | undefined,
  afterId: string | null,
  limit: number,
) {
  const conditions = [
    sql`u.activated_at is not null`,
    ...(search ? [userSearchMatch(search)] : []),
    ...(afterId ? [afterUser(afterId)] : []),
  ];
  const rows = await db.execute(sql`
    select u.id, u.full_name as "fullName", u.is_active as "isActive"
    from ${appUser} u
    ${whereClause(conditions)}
    ${userListOrder}
    limit ${limit + 1}
  `);
  return z.array(userOptionRowSchema).parse([...rows]);
}

export async function countUsers(
  db: DbExecutor,
  filters: UserListFilters,
  now: Date,
): Promise<number> {
  const [row] = await db.execute(sql`
    select count(*)::int as total ${fromUsers}
    ${whereClause(whereFilters(filters, now.toISOString()))}
  `);
  return z.object({ total: z.number().int() }).parse(row).total;
}

const userDetailRowSchema = userListRowSchema.extend({
  createdAt: instant,
  activatedAt: instant.nullable(),
  deactivatedAt: instant.nullable(),
  priorities: z.array(
    z.object({
      verticalId: z.uuid(),
      verticalName: z.string(),
      priority: z.number().int().nullable(),
    }),
  ),
  inviteSentAt: instant.nullable(),
  inviteExpiresAt: instant.nullable(),
  inviteResendCount: z.number().int().nullable(),
  inviteRevokedAt: instant.nullable(),
  inviteRevokedById: z.uuid().nullable(),
  inviteRevokedByName: z.string().nullable(),
  inviteRevokedByActive: z.boolean().nullable(),
  lastActiveAdmin: z.boolean(),
  version: z.number().int().positive(),
});
export type UserDetailRow = z.infer<typeof userDetailRowSchema>;

/** One query for the drawer: profile, derived status, roles, TL priorities and the latest invite (pending first). */
export async function findUserDetail(
  db: DbExecutor,
  userId: string,
  now: Date,
): Promise<UserDetailRow | null> {
  const [row] = await db.execute(sql`
    select u.id, u.full_name as "fullName", u.email,
      ${statusExpr(now.toISOString())} as status,
      u.created_at as "createdAt",
      u.activated_at as "activatedAt",
      u.deactivated_at as "deactivatedAt",
      u.last_login_at as "lastLoginAt",
      u.mfa_locked_until as "mfaLockedUntil",
      u.version,
      (select count(*)::int from ${authMfaTotp} f where f.user_id = u.auth_user_id) as factors,
      coalesce((
        select json_agg(json_build_object('role', r.role, 'verticalId', v.id, 'verticalName', v.name))
        from ${userRole} r left join ${vertical} v on v.id = r.vertical_id
        where r.user_id = u.id
      ), '[]'::json) as roles,
      coalesce((
        select json_agg(json_build_object('verticalId', v.id, 'verticalName', v.name, 'priority', p.priority)
          order by v.name collate "uk-UA-x-icu")
        from ${userRole} r join ${vertical} v on v.id = r.vertical_id
        left join ${teamLeadPriority} p on p.user_id = r.user_id and p.vertical_id = r.vertical_id
        where r.user_id = u.id and r.role = 'TEAM_LEAD'
      ), '[]'::json) as priorities,
      li.sent_at as "inviteSentAt",
      li.expires_at as "inviteExpiresAt",
      li.resend_count::int as "inviteResendCount",
      li.revoked_at as "inviteRevokedAt",
      rb.id as "inviteRevokedById",
      rb.full_name as "inviteRevokedByName",
      rb.is_active as "inviteRevokedByActive",
      (u.is_active and u.activated_at is not null
        and exists (select 1 from ${userRole} ar where ar.user_id = u.id and ar.role = 'ADMIN')
        and not ${otherActiveAdminExists(sql`u.id`)}) as "lastActiveAdmin"
    ${fromUsers}
    left join lateral (
      select x.sent_at, x.expires_at, x.resend_count, x.revoked_at, x.revoked_by
      from ${userInvite} x where x.user_id = u.id
      order by x.status = 'PENDING' desc, x.created_at desc, x.id desc
      limit 1
    ) li on true
    left join ${appUser} rb on rb.id = li.revoked_by
    where u.id = ${userId}::uuid
  `);
  return row ? userDetailRowSchema.parse(row) : null;
}

export async function userExists(
  db: DbExecutor,
  userId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  return row !== undefined;
}

const userEventRowSchema = z.object({
  id: z.coerce.bigint(),
  occurredAt: instant,
  type: z.string(),
  actorKind: z.enum(['USER', 'SYSTEM', 'ADMIN_FORCE']),
  actorId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  actorActive: z.boolean().nullable(),
  payload: z.record(z.string(), z.unknown()),
  verticalId: z.uuid().nullable(),
  verticalNames: z.record(z.string(), z.string()),
});
export type UserEventRow = z.infer<typeof userEventRowSchema>;

/**
 * User timeline, newest first, on `entity_event_subject_idx`; `limit + 1` rows signal a next page.
 * Only `user.*` types and the Team Lead's own `vertical.tl_priority_changed` (D73), never `entity_event_pii`: no names or free text.
 * Legacy profile events were written as subject 'user' before unification; append-only rows are never relabelled (CLAUDE.md §3.5).
 */
export async function listUserEvents(
  db: DbExecutor,
  userId: string,
  cursor: { occurredAt: Date; id: bigint } | null,
  limit: number,
): Promise<UserEventRow[]> {
  const rows = await db.execute(sql`
    select e.id::text as id, e.occurred_at as "occurredAt", e.type,
      e.actor_kind as "actorKind", a.id as "actorId", a.full_name as "actorName",
      a.is_active as "actorActive", e.payload, e.vertical_id as "verticalId",
      (select coalesce(jsonb_object_agg(v.id, v.name), '{}'::jsonb) from ${vertical} v
        where v.id = e.vertical_id or to_jsonb(v.id::text) in (select jsonb_path_query(e.payload, 'lax $.**.verticalId'))
      ) as "verticalNames"
    from ${entityEvent} e
    left join ${appUser} a on a.id = e.actor_id
    where e.subject_type in (${USER_SUBJECT}, 'user') and e.subject_id = ${userId}
      and (e.type like 'user.%' or e.type = 'vertical.tl_priority_changed')
    ${
      cursor
        ? sql`and (e.occurred_at, e.id) < (${cursor.occurredAt.toISOString()}::timestamptz, ${cursor.id.toString()}::bigint)`
        : sql``
    }
    order by e.occurred_at desc, e.id desc
    limit ${limit + 1}
  `);
  return z.array(userEventRowSchema).parse([...rows]);
}
