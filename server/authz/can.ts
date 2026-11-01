import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from '../http/errors';
import type { AuthContext, ResolvedGrant } from './context';
import {
  PERMISSIONS,
  PERMISSION_CODES,
  type GuardedPermission,
  type PermissionCode,
  type PlainPermission,
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
    case 'vacancy':
      switch (scope.kind) {
        case 'VERTICAL':
          return true;
        // D67: a Team Lead's vacancy is the one they currently lead; the creator keeps nothing after reassignment.
        case 'OWN':
          return resource.teamLeadId === me;
        // D13/D65: a recruiter deletes only their own recruiter-initiated vacancy while no application got past NEW.
        case 'OWN_INITIATED_NEW':
          return (
            resource.createdBy === me &&
            resource.recruiterInitiated &&
            (resource.maxApplicationStage === null ||
              resource.maxApplicationStage === 'NEW')
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
    case 'candidate': {
      // Closed applications keep their historical vertical after a transfer (CAND-06), so each is re-scoped.
      const apps = resource.applications.filter((app) =>
        allowed.includes(app.verticalId),
      );
      switch (scope.kind) {
        case 'VERTICAL':
          return true;
        case 'OWN':
          return (
            resource.sourcerId === me ||
            resource.ownerId === me ||
            apps.some((app) => applicationMatches(scope, me, app))
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

/** Current beneficiaries of a bonus-relevant object (DG-19, SEC-CORE-01). */
export function beneficiariesOf(resource: ResourceRef): readonly UserId[] {
  const ofApplication = (app: AppFacts) => [
    app.ownerId,
    app.sourcerId,
    ...app.splitRecipientIds,
  ];
  switch (resource.type) {
    case 'bonus_tranche':
      return [resource.recipientId];
    case 'application':
      return ofApplication(resource);
    case 'candidate':
      return [
        resource.sourcerId,
        ...(resource.ownerId ? [resource.ownerId] : []),
        ...resource.applications.flatMap(ofApplication),
      ];
    default:
      return [];
  }
}

function assertPlain(permission: PermissionCode) {
  if (PERMISSIONS[permission].selfBenefit) {
    throw new Error(`${permission} must be checked with assertCanActOn`);
  }
}

/** In-memory check on an already-loaded (visible) resource. Self-benefit permissions use canActOn. */
export function can<P extends PlainPermission>(
  ctx: AuthContext,
  permission: P,
  resource: ResourceFor<P>,
): boolean {
  assertPlain(permission);
  return evaluate(ctx, permission, resource);
}

/** Call only after a scoped fetch: the object is visible, so a refusal is 403. */
export function assertCan<P extends PlainPermission>(
  ctx: AuthContext,
  permission: P,
  resource: ResourceFor<P>,
): void {
  assertPlain(permission);
  if (!evaluate(ctx, permission, resource)) throw new ForbiddenError();
}

function selfBenefits(
  ctx: AuthContext,
  resource: ResourceRef,
  incoming: readonly UserId[],
) {
  return [...beneficiariesOf(resource), ...incoming].includes(ctx.userId);
}

/**
 * The only check for self-benefit permissions: the actor may be neither a current beneficiary
 * of the object nor one of `incoming` (new owner / split recipients; pass [] when none change).
 */
export function canActOn<P extends GuardedPermission>(
  ctx: AuthContext,
  permission: P,
  resource: ResourceFor<P>,
  incoming: readonly UserId[],
): boolean {
  return (
    evaluate(ctx, permission, resource) &&
    !selfBenefits(ctx, resource, incoming)
  );
}

export function assertCanActOn<P extends GuardedPermission>(
  ctx: AuthContext,
  permission: P,
  resource: ResourceFor<P>,
  incoming: readonly UserId[],
): void {
  if (!evaluate(ctx, permission, resource)) throw new ForbiddenError();
  if (selfBenefits(ctx, resource, incoming)) {
    throw new ForbiddenError('SELF_BENEFIT_FORBIDDEN');
  }
}

export function hasAnyGrant(
  ctx: AuthContext,
  permission: PermissionCode,
): boolean {
  return (ctx.grants.get(permission)?.length ?? 0) > 0;
}

/** Route gating (ADR-002 §5): no grant ⇒ 404 for the whole route; grant withheld for MFA ⇒ 401 MFA_REQUIRED. */
export function requirePermission(
  ctx: AuthContext,
  permission: PermissionCode,
): void {
  if (hasAnyGrant(ctx, permission)) return;
  if (ctx.mfaWithheld.has(permission))
    throw new UnauthenticatedError('MFA_REQUIRED');
  throw new NotFoundError();
}

/** Effective permissions on one resource — input for pipeline.availableActions(); self-benefit ones exclude the actor's own objects. */
export function permissionsFor(
  ctx: AuthContext,
  resource: ResourceRef,
): ReadonlySet<PermissionCode> {
  return new Set(
    PERMISSION_CODES.filter(
      (permission) =>
        evaluate(ctx, permission, resource) &&
        !(
          PERMISSIONS[permission].selfBenefit && selfBenefits(ctx, resource, [])
        ),
    ),
  );
}
