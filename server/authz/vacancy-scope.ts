import { and, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { vacancy, vacancyRecruiter } from '../db/schema';
import { NotFoundError } from '../http/errors';
import type { AuthContext } from './context';
import { scopeWhere, type ScopeAdapter } from './scopes';
import type { VacancyStatus } from './types';
import { vacancyAuthorVerticals } from './vacancy-author';

/** D53 stays closed until owned applications exist; assignment and TL ownership remain vertical-bound. */
const vacancyScope: ScopeAdapter<'vacancy'> = {
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

/**
 * The only vacancy read predicate (D92, D98). A DRAFT belongs to its author alone, whatever else the caller's roles
 * grant (Admin and Head Recruiter included) and only while the author still holds a vacancy-creating role in its
 * vertical; every other status follows the role scope. The role-scope adapter stays private to this module so no read path can skip the draft rule.
 */
export function vacancyReadWhere(
  ctx: AuthContext,
  status?: VacancyStatus,
): SQL {
  const { any } = vacancyAuthorVerticals(ctx);
  const authored =
    any === 'ALL'
      ? sql`true`
      : any.size === 0
        ? sql`false`
        : inArray(vacancy.verticalId, [...any]);
  const draftArm = and(
    eq(vacancy.status, 'DRAFT'),
    eq(vacancy.createdBy, ctx.userId),
    authored,
  )!;
  const roleArm = and(
    ne(vacancy.status, 'DRAFT'),
    scopeWhere(ctx, 'vacancy.read', vacancyScope),
  )!;
  // A status filter makes one arm impossible; dropping it keeps the other indexable (draft arm: `vacancy_draft_author_idx`).
  if (status === 'DRAFT') return draftArm;
  if (status !== undefined) return roleArm;
  return or(roleArm, draftArm)!;
}

/** Scoped single fetch with the draft rule; no row means 404 so a foreign draft never discloses itself. */
export async function findVisibleVacancyOrThrow<T>(
  ctx: AuthContext,
  load: (scope: SQL) => Promise<T | null | undefined>,
): Promise<T> {
  const row = await load(vacancyReadWhere(ctx));
  if (row === null || row === undefined) throw new NotFoundError();
  return row;
}
