import { eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { appUser } from '../db/schema';

/** Row lock so concurrent edits of the same name serialize and the audit `before` is exact. */
export async function lockUserName(db: DbExecutor, userId: string) {
  const [row] = await db
    .select({ fullName: appUser.fullName })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .for('update')
    .limit(1);
  return row ?? null;
}

export async function updateUserName(
  db: DbExecutor,
  userId: string,
  fullName: string,
  now: Date,
): Promise<void> {
  await db
    .update(appUser)
    .set({
      fullName,
      updatedAt: now,
      version: sql`${appUser.version} + 1`,
    })
    .where(eq(appUser.id, userId));
}
