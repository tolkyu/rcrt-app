import type { ResourceRef, ResourceType, ScopeKind } from './types';

export interface PermissionDefinition {
  readonly resources: readonly ResourceType[];
  /** Scope kinds a role (built-in or custom) may grant for this permission (ROLE-04 validation). */
  readonly scopes: readonly ScopeKind[];
  readonly write: boolean;
  /** Actor must not be a beneficiary of the target (DG-19, authz-matrix footnote 7); checked only via assertCanActOn. */
  readonly selfBenefit: boolean;
  /** Never granted without an aal2 session, whatever the role or scope (SEC-CORE-09). */
  readonly mfa: boolean;
}

const read = <const R extends readonly ResourceType[]>(
  resources: R,
  scopes: readonly ScopeKind[],
  mfa = false,
) => ({ resources, scopes, write: false, selfBenefit: false, mfa }) as const;
const write = <const R extends readonly ResourceType[]>(
  resources: R,
  scopes: readonly ScopeKind[],
  mfa = false,
) => ({ resources, scopes, write: true, selfBenefit: false, mfa }) as const;
const guarded = <const R extends readonly ResourceType[]>(
  resources: R,
  scopes: readonly ScopeKind[],
  mfa = false,
) => ({ resources, scopes, write: true, selfBenefit: true, mfa }) as const;
const MFA = true;

const G = 'GLOBAL';
const V = 'VERTICAL';
const VP = 'VERTICAL_FROM_STAGE';
const O = 'OWN';
const ON = 'OWN_INITIATED_NEW';
const A = 'ASSIGNED';
const U = 'UNASSIGNED_OPEN';
const S = 'SUBMITTED_TO_ME';

/** Permission catalog for every phase — docs/authz-matrix.md §2 (codes, resources, legal scopes). */
export const PERMISSIONS = {
  'vacancy.read': read(['vacancy'], [G, V, A, U, O]),
  'vacancy.create': write(['vertical'], [G, V]),
  'vacancy.update': write(['vacancy'], [G, V, O]),
  'vacancy.assign_recruiters': write(['vacancy'], [G, V]),
  'vacancy.self_assign': write(['vacancy'], [U]),
  'vacancy.team_lead.set': write(['vacancy'], [G, V]),
  'vacancy.approve': write(['vacancy'], [G, V]),
  'vacancy.hold': write(['vacancy'], [G, V, O]),
  'vacancy.resume': write(['vacancy'], [G, V, O]),
  'vacancy.cancel': write(['vacancy'], [G, V, O]),
  'vacancy.reopen': write(['vacancy'], [G, V]),
  'vacancy.delete': write(['vacancy'], [G, V, ON]),
  'vacancy.priority.override': write(['vacancy'], [G], MFA),
  'vacancy.bonus_scheme.override': write(['vacancy'], [G], MFA),
  'vacancy.bonus.update': write(['vacancy'], [G], MFA),
  'vacancy.probation_length.set': write(['vacancy'], [G, V]),
  'position.manage': write(['vertical'], [G, V]),

  'candidate.read': read(['candidate'], [G, V, O, VP, S]),
  'candidate.contacts.read': read(['candidate'], [G, V, O, VP]),
  'candidate.transfer_vertical': write(['candidate'], [G, V, VP]),
  'candidate.create': write(['vertical'], [G, V]),
  'candidate.update': write(['candidate'], [G, V, O]),
  'candidate.bonus_flags.set': write(['candidate'], [G, V, O]),
  'candidate.bonus_flags.clear': guarded(['candidate'], [G], MFA),
  'candidate.file.read': read(['candidate'], [G, V, O, VP, S]),
  'candidate.file.upload': write(['candidate'], [G, V, O]),
  'candidate.merge': write(['candidate'], [G, V]),
  'candidate.delete': write(['candidate'], [G, V]),
  'candidate.purge': write(['candidate'], [G], MFA),
  'archive.deleted.read': read(['vacancy', 'candidate'], [G, V]),
  'archive.restore': write(['vacancy', 'candidate'], [G, V]),
  'comment.create': write(['candidate'], [G, V, O, VP, S]),

  'application.read': read(['application'], [G, V, O, VP, S]),
  'application.create': write(['vacancy'], [G, V]),
  'application.reactivate': write(['application'], [G, V, O]),
  'application.move.in_work': write(['application'], [G, V, O]),
  'application.move.submitted_to_tl': write(['application'], [G, V, O]),
  'application.tl_decision': write(['application'], [G, V, S]),
  'application.move.tl_interview': write(['application'], [G, V, O]),
  'application.interview.manage': write(['application'], [G, V, O]),
  'application.interview.reschedule_request': write(['application'], [G, S]),
  'application.move.polygraph': write(['application'], [G, V, O, S]),
  'application.interview.reject': write(['application'], [G, V, O, S]),
  'application.reject.recruiting': write(['application'], [G, V, O]),
  'application.reject.hr': write(['application'], [G, V]),
  'application.withdraw': write(['application'], [G, V, O]),
  'application.move_back.recruiting': write(['application'], [G, V]),
  'application.move_back.hr': write(['application'], [G, V]),
  'application.force_move': write(['application'], [G], MFA),
  'application.reassign_owner': guarded(['application'], [G, V]),
  'application.bonus_split.set': guarded(['application'], [G, V]),
  'application.move.probation': write(['application'], [G, V]),
  'polygraph.assign': write(['application'], [G, V]),
  'polygraph.assign.self': write(['application'], [V]),
  'polygraph.schedule': write(['application'], [G, V]),
  'polygraph.result.record': write(['application'], [G, V]),
  'polygraph.review': write(['application'], [G, V]),
  'polygraph.file.read': read(['application'], [G, VP]),
  'offer.read': read(['application'], [G, V, O, VP, S]),
  'offer.salary.read': read(['application'], [G, V, O, VP, S]),
  'offer.draft': write(['application'], [G, V]),
  'offer.send': write(['application'], [G, V]),
  'offer.outcome.record': write(['application'], [G, V]),
  'probation.length.set': write(['application'], [G, V]),
  'probation.pass': write(['application'], [G, V, S]),
  'probation.pass.override': write(['application'], [G, V]),
  'probation.fail': write(['application'], [G, V, S]),

  'bonus.read': read(['bonus_tranche'], [G, V, O]),
  'bonus.approve': guarded(['bonus_tranche'], [G, V]),
  'bonus.hold': guarded(['bonus_tranche'], [G, V]),
  'bonus.release': guarded(['bonus_tranche'], [G, V]),
  'bonus.mark_paid': guarded(['bonus_tranche'], [G], MFA),
  'bonus.clawback.settle': write(['bonus_tranche'], [G], MFA),
  'bonus.adjust': guarded(['bonus_tranche'], [G], MFA),
  'bonus.self_referral.approve': guarded(['bonus_tranche'], [G], MFA),
  'bonus.payout_report.read': read(['statistics'], [G, V]),
  'bonus.payout_report.export': read(['statistics'], [G, V]),

  'statistics.funnel.read': read(['statistics'], [G, V, O]),
  'statistics.hr.read': read(['statistics'], [G, V, O]),
  'statistics.bonus.read': read(['statistics'], [G, V, O]),
  'statistics.export': read(['statistics'], [G, V, O]),

  'settings.verticals.manage': write(['settings'], [G], MFA),
  'settings.vertical_flags.manage': write(['settings'], [G], MFA),
  'settings.users.manage': write(['settings'], [G], MFA),
  'settings.priorities.manage': write(['settings'], [G], MFA),
  'settings.bonus_schemes.manage': write(['settings'], [G], MFA),
  'settings.reference_data.manage': write(['settings'], [G], MFA),
  'settings.retention.manage': write(['settings'], [G], MFA),
  'settings.jobs.run': write(['settings'], [G], MFA),
  'audit.read': read(['settings'], [G], MFA),

  'user.directory.read': read(['user'], [G, V]),
  'vertical.read': read(['vertical'], [G, V]),
} as const satisfies Record<string, PermissionDefinition>;

export type PermissionCode = keyof typeof PERMISSIONS;
export const PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

export type ResourceTypeOf<P extends PermissionCode> =
  (typeof PERMISSIONS)[P]['resources'][number];
export type ResourceFor<P extends PermissionCode> = Extract<
  ResourceRef,
  { readonly type: ResourceTypeOf<P> }
>;
/** Permissions checked against resource type R — the argument type of scopeWhere(). */
export type PermissionsOn<R extends ResourceType> = {
  [P in PermissionCode]: R extends ResourceTypeOf<P> ? P : never;
}[PermissionCode];

type Definition<P extends PermissionCode> = (typeof PERMISSIONS)[P];
/** Permissions whose actor must not benefit; usable only through canActOn/assertCanActOn. */
export type GuardedPermission = {
  [P in PermissionCode]: Definition<P>['selfBenefit'] extends true ? P : never;
}[PermissionCode];
export type PlainPermission = Exclude<PermissionCode, GuardedPermission>;
/** Read permissions on resource R — the only ones allowed to scope a detail fetch (SEC-CORE-05). */
export type ReadPermissionOn<R extends ResourceType> = {
  [P in PermissionsOn<R>]: Definition<P>['write'] extends false ? P : never;
}[PermissionsOn<R>];

export const isPermissionCode = (value: string): value is PermissionCode =>
  Object.hasOwn(PERMISSIONS, value);
