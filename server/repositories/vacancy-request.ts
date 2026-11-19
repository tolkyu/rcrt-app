import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { appUser, userRole } from '../db/schema';

export async function vacancyRequestRecipients(
  db: DbExecutor,
  verticalId: string,
  requesterId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: appUser.id })
    .from(userRole)
    .innerJoin(appUser, eq(appUser.id, userRole.userId))
    .where(
      and(
        eq(userRole.verticalId, verticalId),
        inArray(userRole.role, ['RECRUITER', 'HEAD_RECRUITER']),
        eq(appUser.isActive, true),
        isNotNull(appUser.activatedAt),
        ne(appUser.id, requesterId),
      ),
    )
    .orderBy(appUser.id);
  return rows.map((row) => row.id);
}
