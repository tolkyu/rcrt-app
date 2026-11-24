import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbExecutor } from '../db';
import { appUser, userRole, vacancyRecruiter } from '../db/schema';
import { eligibleRecruiterSql } from './recruiter-eligibility';

/** Read under the vacancy lock: the lock serialises every writer of the set, so this is the whole truth. */
export async function listRecruiterIds(
  db: DbExecutor,
  vacancyId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: vacancyRecruiter.userId })
    .from(vacancyRecruiter)
    .where(eq(vacancyRecruiter.vacancyId, vacancyId));
  return rows.map((row) => row.userId);
}

export async function insertRecruiters(
  db: DbExecutor,
  vacancyId: string,
  userIds: readonly string[],
  assignedBy: string,
  assignedAt: Date,
) {
  await db
    .insert(vacancyRecruiter)
    .values(
      userIds.map((userId) => ({ vacancyId, userId, assignedBy, assignedAt })),
    );
}

export async function deleteRecruiter(
  db: DbExecutor,
  vacancyId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .delete(vacancyRecruiter)
    .where(
      and(
        eq(vacancyRecruiter.vacancyId, vacancyId),
        eq(vacancyRecruiter.userId, userId),
      ),
    )
    .returning({ userId: vacancyRecruiter.userId });
  return rows.length === 1;
}

const assignableRowSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  assigned: z.boolean(),
  active: z.boolean(),
});

/** D79/D130(1): eligible recruiters of the vertical plus everyone already assigned (so a deactivated assignee can still be removed); one statement, both arms index-driven. */
export async function findAssignableRecruiters(
  db: DbExecutor,
  vacancyId: string,
  verticalId: string,
) {
  const rows = await db.execute(sql`
    with assigned as (
      select user_id from ${vacancyRecruiter} where vacancy_id = ${vacancyId}::uuid
    ), candidates as (
      select r.user_id as id from ${userRole} r
      join ${appUser} u on u.id = r.user_id
      where r.vertical_id = ${verticalId}::uuid and ${eligibleRecruiterSql('r', 'u')}
      union
      select user_id from assigned
    )
    select u.id, u.full_name as "fullName",
      exists (select 1 from assigned a where a.user_id = u.id) as assigned,
      u.is_active as active
    from candidates c
    join ${appUser} u on u.id = c.id
    order by u.full_name collate "uk-UA-x-icu", u.id
  `);
  return z.array(assignableRowSchema).parse([...rows]);
}
