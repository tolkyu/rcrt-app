import {
  and,
  eq,
  inArray,
  isNull,
  ne,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { vacancy, vacancyRecruiter } from '../db/schema';
import { NotFoundError } from '../http/errors';
import type { AuthContext } from './context';
import { scopeWhere, type ScopeAdapter, type ScopeArgs } from './scopes';
import type { VacancyStatus } from './types';
import { vacancyAuthorVerticals } from './vacancy-author';

/** D53 stays closed until owned applications exist; assignment and TL ownership remain vertical-bound. */
const vacancyScope = {
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
} satisfies ScopeAdapter<'vacancy'>;

/** SQL twin of `isNeverOpenedCancelled`. */
const cancelledDraft = and(
  eq(vacancy.status, 'CANCELLED'),
  isNull(vacancy.openedAt),
)!;

/** Verticals where the caller may author a vacancy: the only place a private draft of theirs stays reachable (D98). */
function authoredIn(ctx: AuthContext): SQL {
  const { any } = vacancyAuthorVerticals(ctx);
  if (any === 'ALL') return sql`true`;
  return any.size === 0 ? sql`false` : inArray(vacancy.verticalId, [...any]);
}

/** What the caller's roles grant once every private draft is taken out; the one place that rule lives, shared by the read and the list predicate. */
function roleScopeWithoutPrivateDrafts(
  ctx: AuthContext,
  excludeCancelledDrafts: boolean,
): SQL {
  return and(
    ne(vacancy.status, 'DRAFT'),
    excludeCancelledDrafts ? not(cancelledDraft) : undefined,
    scopeWhere(ctx, 'vacancy.read', vacancyScope),
  )!;
}

/**
 * The only vacancy read predicate (D92, D98). A DRAFT, and a draft its author cancelled, belongs to its author alone,
 * whatever else the caller's roles grant (Admin and Head Recruiter included) and only while the author still holds a
 * vacancy-creating role in its vertical; every other status follows the role scope. The role-scope adapter stays
 * private to this module so no read path can skip the draft rule.
 */
export function vacancyReadWhere(
  ctx: AuthContext,
  status?: VacancyStatus,
): SQL {
  const mine = and(eq(vacancy.createdBy, ctx.userId), authoredIn(ctx))!;
  const draftArm = and(eq(vacancy.status, 'DRAFT'), mine)!;
  const cancelledArm = and(cancelledDraft, mine)!;
  // A status filter drops arms so the rest stays indexable (draft arm: `vacancy_draft_author_idx`); an author's cancelled drafts are a handful, found through the role-scope indexes with a row filter.
  if (status === 'DRAFT') return draftArm;
  if (status === 'CANCELLED')
    return or(roleScopeWithoutPrivateDrafts(ctx, true), cancelledArm)!;
  if (status !== undefined) return roleScopeWithoutPrivateDrafts(ctx, false);
  return or(roleScopeWithoutPrivateDrafts(ctx, true), draftArm, cancelledArm)!;
}

/**
 * Predicate of the vacancy list (D110): without a status filter («Усі») an author's own drafts, cancelled ones too,
 * stay out and live under «Чернетки» / «Скасовані» only. A status filter and every by-id read keep using `vacancyReadWhere`,
 * so a draft card still opens for its author.
 */
export function vacancyListWhere(
  ctx: AuthContext,
  status?: VacancyStatus,
): SQL {
  return status === undefined
    ? roleScopeWithoutPrivateDrafts(ctx, true)
    : vacancyReadWhere(ctx, status);
}

/** Explicitly qualified: Drizzle drops qualifiers in single-table selects and `vertical_id` exists on `vacancy` too, so a bare name inside a subquery would bind to the wrong table. */
const eventColumn = (column: string) =>
  sql`${sql.identifier('entity_event')}.${sql.identifier(column)}`;

/** Vacancy-level scope kinds need the vacancy row: one primary-key probe per event, never a scan of `vacancy`. */
const throughVacancy = (scope: (args: ScopeArgs) => SQL) => (args: ScopeArgs) =>
  sql`exists (select 1 from ${vacancy} where ${vacancy.id} = ${eventColumn('vacancy_id')} and ${scope(args)})`;

const eventScope: ScopeAdapter<'vacancy'> = {
  resource: 'vacancy',
  VERTICAL: ({ verticalIds }) =>
    inArray(eventColumn('vertical_id'), [...verticalIds]),
  OWN: throughVacancy(vacancyScope.OWN),
  ASSIGNED: throughVacancy(vacancyScope.ASSIGNED),
  UNASSIGNED_OPEN: throughVacancy(vacancyScope.UNASSIGNED_OPEN),
};

/** Row filter for any reader of `entity_event` (D92): never-opened vacancy events are author-only, every other vacancy event follows the vacancy read scope. */
export function vacancyEventReadWhere(ctx: AuthContext): SQL {
  const verticalId = eventColumn('vertical_id');
  return sql`(${eventColumn('vacancy_id')} is null
    or (${verticalId} is null and ${eventColumn('actor_id')} = ${ctx.userId})
    or (${verticalId} is not null and ${scopeWhere(ctx, 'vacancy.read', eventScope)}))`;
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
