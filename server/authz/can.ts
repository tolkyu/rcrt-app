import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from '../http/errors';
import type { AuthContext, ResolvedGrant } from './context';
import {
  PERMISSIONS,
  PERMISSION_CODES,
  type PermissionCode,
  type ResourceFor,
} from './permissions';
import {
  stageOrdinal,
  type ApplicationRef,
  type ResourceRef,
  type Scope,
  type Stage,
  type UserId,
  type VerticalId,
} from './types';

type AppFacts = Omit<ApplicationRef, 'type'>;

const reached = (stage: Stage, floor: Stage) =>
  stageOrdinal(stage) >= stageOrdinal(floor);

function applicationMatches(scope: Scope, me: UserId, app: AppFacts): boolean {
  switch (scope.kind) {
    case 'VERTICAL':
      return true;
    case 'VERTICAL_FROM_STAGE':
      return reached(app.maxStageReached, scope.stage);
    case 'OWN':
      return app.ownerId === me || app.sourcerId === me;
    case 'SUBMITTED_TO_ME':
      return (
        app.teamLeadId === me && reached(app.maxStageReached, 'SUBMITTED_TO_TL')
      );
    default:
      return false;
  }
}

/** In-memory twin of the SQL predicates in scopes.ts; contract tests keep both in agreement. */
function scopeMatches(
  scope: Scope,
  me: UserId,
  resource: ResourceRef,
  allowed: readonly VerticalId[],
): boolean {
  switch (resource.type) {
    case 'settings':
      return false;
    case 'vertical':
      return scope.kind === 'VERTICAL';
    case 'user':
      return scope.kind === 'VERTICAL';
    case 'statistics':
      if (scope.kind === 'VERTICAL') return true;
      return scope.kind === 'OWN' && resource.subjectUserId === me;
    case 'bonus_tranche':
      if (scope.kind === 'VERTICAL') return true;
      return scope.kind === 'OWN' && resource.recipientId === me;
    case 'application':
      return applicationMatches(scope, me, resource);
    case 'vacancy': {
      const own = resource.teamLeadId === me || resource.createdBy === me;
      switch (scope.kind) {
        case 'VERTICAL':
          return true;
        case 'OWN':
          return own;
        case 'OWN_EARLY':
          return (
            own &&
            (resource.maxApplicationStage === null ||
              !reached(resource.maxApplicationStage, 'TL_INTERVIEW'))
          );
        case 'ASSIGNED':
          return resource.assignedRecruiterIds.includes(me);
        case 'UNASSIGNED_OPEN':
          return (
            resource.status === 'OPEN' &&
            resource.assignedRecruiterIds.length === 0
          );
        default:
          return false;
      }
    }
    case 'candidate': {
      // Closed applications keep their historical vertical after a transfer (CAND-06), so each is re-scoped.
      const apps = resource.applications.filter((app) =>
        allowed.includes(app.verticalId),
      );
      const ownCandidate =
        resource.sourcerId === me ||
        resource.ownerId === me ||
        apps.some((app) => applicationMatches({ kind: 'OWN' }, me, app));
      switch (scope.kind) {
        case 'VERTICAL':
          return true;
        case 'OWN':
          return ownCandidate;
        case 'OWN_EARLY':
          return (
            ownCandidate &&
            resource.applications.every(
              (app) => !reached(app.maxStageReached, 'TL_INTERVIEW'),
            )
          );
        case 'VERTICAL_FROM_STAGE':
        case 'SUBMITTED_TO_ME':
          return apps.some((app) => applicationMatches(scope, me, app));
        default:
          return false;
      }
    }
  }
}

function resourceVerticals(
  resource: ResourceRef,
): readonly VerticalId[] | null {
  switch (resource.type) {
    case 'settings':
      return null;
    case 'vertical':
      return [resource.id];
    case 'user':
      return resource.verticalIds;
    case 'statistics':
      return resource.verticalId ? [resource.verticalId] : null;
    default:
      return [resource.verticalId];
  }
}

function grantMatches(
  grant: ResolvedGrant,
  ctx: AuthContext,
  resource: ResourceRef,
): boolean {
  if (grant.scope.kind === 'GLOBAL') return true;
  const verticals = resourceVerticals(resource);
  if (!verticals || grant.verticalIds === 'ALL') return false;
  const allowed = grant.verticalIds;
  if (!verticals.some((id) => allowed.includes(id))) return false;
  return scopeMatches(grant.scope, ctx.userId, resource, allowed);
}

function evaluate(
  ctx: AuthContext,
  permission: PermissionCode,
  resource: ResourceRef,
): boolean {
  const resources: readonly string[] = PERMISSIONS[permission].resources;
  if (!resources.includes(resource.type)) return false;
  return (ctx.grants.get(permission) ?? []).some((grant) =>
    grantMatches(grant, ctx, resource),
  );
}

/** In-memory check on an already-loaded (visible) resource. */
export function can<P extends PermissionCode>(
  ctx: AuthContext,
  permission: P,
  resource: ResourceFor<P>,
): boolean {
  return evaluate(ctx, permission, resource);
}

/** Call only after a scoped fetch: the object is visible, so a refusal is 403. */
export function assertCan<P extends PermissionCode>(
  ctx: AuthContext,
  permission: P,
  resource: ResourceFor<P>,
): void {
  if (!evaluate(ctx, permission, resource)) throw new ForbiddenError();
}

export function hasAnyGrant(
  ctx: AuthContext,
  permission: PermissionCode,
): boolean {
  return (ctx.grants.get(permission)?.length ?? 0) > 0;
}

/** Route gating (ADR-002 §5): no grant ⇒ 404 for the whole route; withheld ADMIN/FINANCE grant ⇒ 401 MFA_REQUIRED. */
export function requirePermission(
  ctx: AuthContext,
  permission: PermissionCode,
): void {
  if (hasAnyGrant(ctx, permission)) return;
  if (ctx.mfaWithheld.has(permission))
    throw new UnauthenticatedError('MFA_REQUIRED');
  throw new NotFoundError();
}

/** Effective permissions on one resource — input for pipeline.availableActions(). */
export function permissionsFor(
  ctx: AuthContext,
  resource: ResourceRef,
): ReadonlySet<PermissionCode> {
  return new Set(
    PERMISSION_CODES.filter((permission) =>
      evaluate(ctx, permission, resource),
    ),
  );
}

/** Separation of duties (DG-19): nobody acts on a bonus, split or ownership that benefits themselves. */
export function assertNotSelfBenefit(
  ctx: AuthContext,
  permission: PermissionCode,
  beneficiaryIds: readonly UserId[],
): void {
  if (
    PERMISSIONS[permission].selfBenefit &&
    beneficiaryIds.includes(ctx.userId)
  ) {
    throw new ForbiddenError('SELF_BENEFIT_FORBIDDEN');
  }
}
