import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbExecutor } from '../db';
import { appUser, authSessionStatus, userRole } from '../db/schema';

const principalSchema = z.object({
  userId: z.uuid(),
  isActive: z.boolean(),
  timezone: z.string(),
  sessionValid: z.boolean(),
  roles: z.preprocess(
    (value) => (typeof value === 'string' ? JSON.parse(value) : value),
    z.array(z.object({ role: z.string(), verticalId: z.uuid().nullable() })),
  ),
});
export type PrincipalRow = z.infer<typeof principalSchema>;

/**
 * The per-request context query (ADR-002 §4, DG-05): user, active flag, roles × verticals and
 * session validity in one round-trip. Written with explicit aliases because correlated subqueries
 * in a single-table Drizzle select would render unqualified column names.
 */
export async function findPrincipal(
  db: DbExecutor,
  identity: { readonly authUserId: string; readonly sessionId: string },
  now: Date,
): Promise<PrincipalRow | null> {
  const rows = await db.execute(sql`
    select u.id as "userId", u.is_active as "isActive", u.timezone,
      exists (
        select 1 from ${authSessionStatus} s
        where s.id = ${identity.sessionId} and s.user_id = u.auth_user_id
          and (s.not_after is null or s.not_after > ${now.toISOString()}::timestamptz)
      ) as "sessionValid",
      coalesce((
        select json_agg(json_build_object('role', r.role, 'verticalId', r.vertical_id)
          order by r.role, r.vertical_id)
        from ${userRole} r where r.user_id = u.id
      ), '[]'::json) as roles
    from ${appUser} u
    where u.auth_user_id = ${identity.authUserId}
    limit 1
  `);
  const [row] = rows;
  return row ? principalSchema.parse(row) : null;
}
