import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { appUser } from '../db/schema';

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
