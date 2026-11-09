import { and, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import type { RoleAssignmentRef } from '../../lib/role-diff';
import type { DbExecutor } from '../db';
import { vacancy, vacancyRecruiter } from '../db/schema';

/** Proposed roles preserve compatible recruiter membership; absent roles mean deactivation loses all work eligibility. A DRAFT is private to its author and never open work (D98). */
export async function userHasOpenVacancyWork(
  db: DbExecutor,
  userId: string,
  remainingRoles?: readonly RoleAssignmentRef[],
): Promise<boolean> {
  const keep = (codes: readonly string[]) =>
    remainingRoles?.flatMap(({ role, verticalId }) =>
      verticalId && codes.includes(role) ? [verticalId] : [],
    ) ?? [];
  const teamLeadVerticals = keep(['TEAM_LEAD']);
  const recruiterVerticals = keep(['RECRUITER', 'HEAD_RECRUITER']);
  const [row] = await db
    .select({ id: vacancy.id })
    .from(vacancy)
    .where(
      and(
        isNull(vacancy.deletedAt),
        inArray(vacancy.status, ['OPEN', 'ON_HOLD']),
        or(
          and(
            eq(vacancy.teamLeadId, userId),
            teamLeadVerticals.length
              ? notInArray(vacancy.verticalId, teamLeadVerticals)
              : sql`true`,
          ),
          and(
            sql`exists (select 1 from ${vacancyRecruiter} where ${vacancyRecruiter.vacancyId} = ${vacancy.id} and ${vacancyRecruiter.userId} = ${userId})`,
            recruiterVerticals.length
              ? notInArray(vacancy.verticalId, recruiterVerticals)
              : sql`true`,
          ),
        ),
      ),
    )
    .limit(1);
  return !!row;
}
