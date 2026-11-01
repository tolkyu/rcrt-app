import {
  and,
  asc,
  countDistinct,
  eq,
  isNotNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { appUser, userRole, vertical } from '../db/schema';

/** Every vertical list is scoped by the caller's grant predicate (VIS-02). */
export function listVerticals(db: DbExecutor, scope: SQL) {
  return db
    .select({ id: vertical.id, name: vertical.name })
    .from(vertical)
    .where(scope)
    .orderBy(asc(vertical.name), asc(vertical.id));
}

/** One query for «Налаштування → Вертикалі»: users = signed-up, not deactivated users (status «Активний») with ≥ 1 role; invitees are excluded. */
export function listVerticalsWithUserCounts(db: DbExecutor) {
  return db
    .select({
      id: vertical.id,
      name: vertical.name,
      createdAt: vertical.createdAt,
      version: vertical.version,
      usersCount: countDistinct(appUser.id),
    })
    .from(vertical)
    .leftJoin(userRole, eq(userRole.verticalId, vertical.id))
    .leftJoin(
      appUser,
      and(
        eq(appUser.id, userRole.userId),
        eq(appUser.isActive, true),
        isNotNull(appUser.activatedAt),
      ),
    )
    .groupBy(vertical.id)
    .orderBy(asc(vertical.name), asc(vertical.id));
}

export async function insertVertical(db: DbExecutor, name: string, now: Date) {
  const [row] = await db
    .insert(vertical)
    .values({ name, createdAt: now, updatedAt: now })
    .returning({
      id: vertical.id,
      name: vertical.name,
      createdAt: vertical.createdAt,
      version: vertical.version,
    });
  return row!;
}

/** Row lock so concurrent renames serialize and the audit `before` is exact. */
export async function lockVertical(db: DbExecutor, verticalId: string) {
  const [row] = await db
    .select({
      id: vertical.id,
      name: vertical.name,
      createdAt: vertical.createdAt,
      version: vertical.version,
    })
    .from(vertical)
    .where(eq(vertical.id, verticalId))
    .for('update')
    .limit(1);
  return row ?? null;
}

export async function renameVertical(
  db: DbExecutor,
  verticalId: string,
  name: string,
  now: Date,
) {
  const [row] = await db
    .update(vertical)
    .set({ name, updatedAt: now, version: sql`${vertical.version} + 1` })
    .where(eq(vertical.id, verticalId))
    .returning({
      id: vertical.id,
      name: vertical.name,
      createdAt: vertical.createdAt,
      version: vertical.version,
    });
  return row!;
}

export function countActiveVerticalUsers(db: DbExecutor, verticalId: string) {
  return db
    .select({ usersCount: countDistinct(appUser.id) })
    .from(userRole)
    .innerJoin(
      appUser,
      and(
        eq(appUser.id, userRole.userId),
        eq(appUser.isActive, true),
        isNotNull(appUser.activatedAt),
      ),
    )
    .where(eq(userRole.verticalId, verticalId))
    .then(([row]) => row?.usersCount ?? 0);
}
