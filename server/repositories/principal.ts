import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  SESSION_IDLE_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from '../auth/session-policy';
import type { DbExecutor } from '../db';
import {
  appUser,
  authSessionStatus,
  userRole,
  userSession,
} from '../db/schema';

const jsonColumn = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? JSON.parse(value) : value),
    schema,
  );

const principalSchema = z.object({
  userId: z.uuid(),
  isActive: z.boolean(),
  timezone: z.string(),
  mfaLocked: z.boolean(),
  authSession: jsonColumn(
    z.object({ createdAt: z.coerce.date().nullable() }).nullable(),
  ),
  appSession: jsonColumn(
    z
      .object({
        startedAt: z.coerce.date(),
        lastSeenAt: z.coerce.date(),
        ended: z.boolean(),
      })
      .nullable(),
  ),
  roles: jsonColumn(
    z.array(z.object({ role: z.string(), verticalId: z.uuid().nullable() })),
  ),
});
export type PrincipalRow = z.infer<typeof principalSchema>;

/**
 * The per-request context query (ADR-002 §4, DG-05, T4-B01..B03): user, active flag, MFA lock,
 * roles × verticals, the Supabase session and the app session in one round-trip. A user-initiated
 * request also refreshes `last_seen_at` in the same statement, at most once a minute and never
 * after the idle limit has passed. Explicit aliases: correlated subqueries in a single-table
 * Drizzle select would render unqualified column names.
 */
export async function findPrincipal(
  db: DbExecutor,
  identity: { readonly authUserId: string; readonly sessionId: string },
  now: Date,
  options: { readonly touch?: boolean } = {},
): Promise<PrincipalRow | null> {
  const at = now.toISOString();
  const touchBefore = new Date(
    now.getTime() - SESSION_TOUCH_INTERVAL_MS,
  ).toISOString();
  const idleSince = new Date(now.getTime() - SESSION_IDLE_MS).toISOString();
  const rows = await db.execute(sql`
    with touched as (
      update ${userSession} set last_seen_at = ${at}::timestamptz
      where session_id = ${identity.sessionId} and ${options.touch === true}
        and ended_at is null
        and last_seen_at < ${touchBefore}::timestamptz
        and last_seen_at > ${idleSince}::timestamptz
      returning session_id
    )
    select u.id as "userId", u.is_active as "isActive", u.timezone,
      coalesce(u.mfa_locked_until > ${at}::timestamptz, false) as "mfaLocked",
      (
        select json_build_object('createdAt', s.created_at) from ${authSessionStatus} s
        where s.id = ${identity.sessionId} and s.user_id = u.auth_user_id
          and (s.not_after is null or s.not_after > ${at}::timestamptz)
      ) as "authSession",
      case when us.session_id is null then null else json_build_object(
        'startedAt', us.started_at, 'lastSeenAt', us.last_seen_at, 'ended', us.ended_at is not null
      ) end as "appSession",
      coalesce((
        select json_agg(json_build_object('role', r.role, 'verticalId', r.vertical_id)
          order by r.role, r.vertical_id)
        from ${userRole} r where r.user_id = u.id
      ), '[]'::json) as roles
    from ${appUser} u
    left join ${userSession} us on us.session_id = ${identity.sessionId} and us.user_id = u.id
    where u.auth_user_id = ${identity.authUserId}
    limit 1
  `);
  const [row] = rows;
  return row ? principalSchema.parse(row) : null;
}
