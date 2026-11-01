import { and, asc, eq, isNotNull, like } from 'drizzle-orm';
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
