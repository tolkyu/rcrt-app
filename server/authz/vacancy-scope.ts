import { and, eq, inArray, sql } from 'drizzle-orm';
import { vacancy, vacancyRecruiter } from '../db/schema';
import type { ScopeAdapter } from './scopes';

/** D53 stays closed until owned applications exist; assignment and TL ownership remain vertical-bound. */
export const vacancyScope: ScopeAdapter<'vacancy'> = {
  resource: 'vacancy',
  VERTICAL: ({ verticalIds }) => inArray(vacancy.verticalId, [...verticalIds]),
  OWN: ({ me, verticalIds }) =>
    and(
      inArray(vacancy.verticalId, [...verticalIds]),
      eq(vacancy.teamLeadId, me),
    )!,
  ASSIGNED: ({ me, verticalIds }) =>
    and(
      inArray(vacancy.verticalId, [...verticalIds]),
      sql`exists (select 1 from ${vacancyRecruiter} where ${vacancyRecruiter.vacancyId} = ${vacancy.id} and ${vacancyRecruiter.userId} = ${me})`,
    )!,
  UNASSIGNED_OPEN: ({ verticalIds }) =>
    and(
      inArray(vacancy.verticalId, [...verticalIds]),
      eq(vacancy.status, 'OPEN'),
      // A scalar count lets the planner probe the assignment primary key per row; NOT EXISTS hashes every assignment.
      sql`(select count(*) from ${vacancyRecruiter} where ${vacancyRecruiter.vacancyId} = ${vacancy.id}) = 0`,
    )!,
};
