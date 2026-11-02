import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { RoleAssignmentRef } from '../../lib/role-diff';
import type { DbExecutor } from '../db';
import { appUser, userRole } from '../db/schema';

/** Serialises every write that can shrink the set of active Admins, so two removals cannot both see «one more left» (D45). */
const ADMIN_MEMBERSHIP_LOCK = 742918605;

export async function lockAdminMembership(db: DbExecutor): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(${ADMIN_MEMBERSHIP_LOCK})`);
}

/** Another active (invite-accepted) user still holds ADMIN; `userId` is a column or parameter expression. */
export const otherActiveAdminExists = (userId: SQL) => sql`exists (
  select 1 from ${userRole} ar join ${appUser} au on au.id = ar.user_id
  where ar.role = 'ADMIN' and au.is_active and au.activated_at is not null and au.id <> ${userId}
)`;

export async function hasOtherActiveAdmin(
  db: DbExecutor,
  userId: string,
): Promise<boolean> {
  const [row] = await db.execute(
    sql`select ${otherActiveAdminExists(sql`${userId}::uuid`)} as exists`,
  );
  return z.object({ exists: z.boolean() }).parse(row).exists;
}

export async function deleteUserRoles(
  db: DbExecutor,
  userId: string,
  roles: readonly RoleAssignmentRef[],
): Promise<void> {
  if (roles.length === 0) return;
  await db
    .delete(userRole)
    .where(
      and(
        eq(userRole.userId, userId),
        or(
          ...roles.map(
            (r) =>
              sql`(${userRole.role} = ${r.role} and ${userRole.verticalId} is not distinct from ${r.verticalId}::uuid)`,
          ),
        ),
      ),
    );
}

export async function bumpUserVersion(
  db: DbExecutor,
  userId: string,
  now: Date,
): Promise<number> {
  const [row] = await db
    .update(appUser)
    .set({ updatedAt: now, version: sql`${appUser.version} + 1` })
    .where(eq(appUser.id, userId))
    .returning({ version: appUser.version });
  return row!.version;
}
