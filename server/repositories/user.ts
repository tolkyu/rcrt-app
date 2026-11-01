import { asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { appUser, userRole, vertical } from '../db/schema';

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
