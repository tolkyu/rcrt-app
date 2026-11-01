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
  userInvite,
  userRole,
  vertical,
} from '../db/schema';

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

function whereFilters(filters: UserListFilters, at: string): SQL[] {
  const conditions: SQL[] = [];
  if (filters.search) {
    const pattern = `%${filters.search.replace(/[\\%_]/g, '\\$&')}%`;
    conditions.push(
      sql`(u.full_name ilike ${pattern} or u.email ilike ${pattern})`,
    );
  }
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
  if (afterId)
    conditions.push(
      sql`(not u.is_active, u.full_name collate "uk-UA-x-icu", u.id) >
        (select not c.is_active, c.full_name collate "uk-UA-x-icu", c.id
          from ${appUser} c where c.id = ${afterId}::uuid)`,
    );
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
    order by not u.is_active, u.full_name collate "uk-UA-x-icu", u.id
    limit ${limit + 1}
  `);
  return z.array(userListRowSchema).parse([...rows]);
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
