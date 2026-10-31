import type { ResourceRef, ResourceType, ScopeKind } from './types';

export interface PermissionDefinition {
  readonly resources: readonly ResourceType[];
  /** Scope kinds a role (built-in or custom) may grant for this permission (ROLE-04 validation). */
  readonly scopes: readonly ScopeKind[];
  readonly write: boolean;
  /** Actor must not be a beneficiary of the target (DG-19, authz-matrix footnote 7). */
  readonly selfBenefit: boolean;
}

const read = <const R extends readonly ResourceType[]>(
  resources: R,
  scopes: readonly ScopeKind[],
) => ({ resources, scopes, write: false, selfBenefit: false }) as const;
const write = <const R extends readonly ResourceType[]>(
  resources: R,
  scopes: readonly ScopeKind[],
  selfBenefit = false,
) => ({ resources, scopes, write: true, selfBenefit }) as const;

const G = 'GLOBAL';
const V = 'VERTICAL';
const VP = 'VERTICAL_FROM_STAGE';
const O = 'OWN';
const OE = 'OWN_EARLY';
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
  'vacancy.delete': write(['vacancy'], [G, V, OE]),
  'vacancy.priority.override': write(['vacancy'], [G]),
  'vacancy.bonus_scheme.override': write(['vacancy'], [G]),
  'vacancy.bonus.update': write(['vacancy'], [G]),
  'vacancy.probation_length.set': write(['vacancy'], [G, V]),
  'position.manage': write(['vertical'], [G, V]),

  'candidate.read': read(['candidate'], [G, V, O, VP, S]),
  'candidate.contacts.read': read(['candidate'], [G, V, O, VP]),
  'candidate.transfer_vertical': write(['candidate'], [G, V, VP]),
  'candidate.create': write(['vertical'], [G, V]),
  'candidate.update': write(['candidate'], [G, V, O]),
  'candidate.bonus_flags.update': write(['candidate'], [G, V, VP]),
  'candidate.file.read': read(['candidate'], [G, V, O, VP, S]),
  'candidate.file.upload': write(['candidate'], [G, V, O]),
  'candidate.merge': write(['candidate'], [G, V]),
  'candidate.delete': write(['candidate'], [G, V, OE]),
  'candidate.purge': write(['candidate'], [G]),
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
  'application.force_move': write(['application'], [G]),
  'application.reassign_owner': write(['application'], [G, V], true),
  'application.bonus_split.set': write(['application'], [G, V], true),
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
  'bonus.approve': write(['bonus_tranche'], [G, V], true),
  'bonus.hold': write(['bonus_tranche'], [G, V], true),
  'bonus.release': write(['bonus_tranche'], [G, V], true),
  'bonus.mark_paid': write(['bonus_tranche'], [G], true),
  'bonus.clawback.settle': write(['bonus_tranche'], [G]),
  'bonus.adjust': write(['bonus_tranche'], [G], true),
  'bonus.self_referral.approve': write(['bonus_tranche'], [G], true),
  'bonus.payout_report.read': read(['statistics'], [G, V]),
  'bonus.payout_report.export': read(['statistics'], [G, V]),

  'statistics.funnel.read': read(['statistics'], [G, V, O]),
  'statistics.hr.read': read(['statistics'], [G, V, O]),
  'statistics.bonus.read': read(['statistics'], [G, V, O]),
  'statistics.export': read(['statistics'], [G, V, O]),

  'settings.verticals.manage': write(['settings'], [G]),
  'settings.vertical_flags.manage': write(['settings'], [G]),
  'settings.users.manage': write(['settings'], [G]),
  'settings.priorities.manage': write(['settings'], [G]),
  'settings.bonus_schemes.manage': write(['settings'], [G]),
  'settings.reference_data.manage': write(['settings'], [G]),
  'settings.retention.manage': write(['settings'], [G]),
  'settings.jobs.run': write(['settings'], [G]),
  'audit.read': read(['settings'], [G]),

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

export const isPermissionCode = (value: string): value is PermissionCode =>
  Object.hasOwn(PERMISSIONS, value);
