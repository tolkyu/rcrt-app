import type { AuthContext } from './context';
import type { PermissionCode } from './permissions';
import type { VerticalId } from './types';

type VerticalSet = 'ALL' | ReadonlySet<VerticalId>;

/** Verticals where the caller holds a permission under any scope kind; GLOBAL means all of them. */
export function grantedVerticals(
  ctx: AuthContext,
  permission: PermissionCode,
): VerticalSet {
  const ids = new Set<VerticalId>();
  for (const grant of ctx.grants.get(permission) ?? []) {
    if (grant.scope.kind === 'GLOBAL' || grant.verticalIds === 'ALL')
      return 'ALL';
    for (const id of grant.verticalIds) ids.add(id);
  }
  return ids;
}

const covers = (set: VerticalSet, id: VerticalId) =>
  set === 'ALL' || set.has(id);

export const grantCovers = (
  ctx: AuthContext,
  permission: PermissionCode,
  verticalId: VerticalId,
) => covers(grantedVerticals(ctx, permission), verticalId);

function intersect(a: VerticalSet, b: VerticalSet): VerticalSet {
  if (a === 'ALL') return b;
  if (b === 'ALL') return a;
  return new Set([...a].filter((id) => b.has(id)));
}

function union(a: VerticalSet, b: VerticalSet): VerticalSet {
  if (a === 'ALL' || b === 'ALL') return 'ALL';
  return new Set([...a, ...b]);
}

/**
 * Who may use the full create form (D89): `vacancy.create` together with a recruiting-side grant. A Team Lead also holds
 * `vacancy.create` for the request path (D87), but never `vacancy.assign_recruiters` or `vacancy.self_assign`.
 * ASSIGNER (Admin, Head Recruiter) may pick the Team Lead and recruiters; SELF_ASSIGNER (Recruiter) is auto-assigned to what they create.
 */
export type VacancyAuthorKind = 'ASSIGNER' | 'SELF_ASSIGNER';

export function vacancyAuthorVerticals(ctx: AuthContext) {
  const create = grantedVerticals(ctx, 'vacancy.create');
  const assigner = intersect(
    create,
    grantedVerticals(ctx, 'vacancy.assign_recruiters'),
  );
  const selfAssigner = intersect(
    create,
    grantedVerticals(ctx, 'vacancy.self_assign'),
  );
  return { assigner, selfAssigner, any: union(assigner, selfAssigner) };
}

export function vacancyAuthorKind(
  ctx: AuthContext,
  verticalId: VerticalId,
): VacancyAuthorKind | null {
  const { assigner, selfAssigner } = vacancyAuthorVerticals(ctx);
  if (covers(assigner, verticalId)) return 'ASSIGNER';
  return covers(selfAssigner, verticalId) ? 'SELF_ASSIGNER' : null;
}
