import { eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { appUser } from '../db/schema';

export async function setUserActive(
  db: DbExecutor,
  userId: string,
  active: boolean,
  actorId: string,
  now: Date,
): Promise<number> {
  const [row] = await db
    .update(appUser)
    .set({
      isActive: active,
      deactivatedAt: active ? null : now,
      deactivatedBy: active ? null : actorId,
      updatedAt: now,
      version: sql`${appUser.version} + 1`,
    })
    .where(eq(appUser.id, userId))
    .returning({ version: appUser.version });
  return row!.version;
}
