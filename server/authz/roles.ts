import { PERMISSION_CODES, type PermissionCode } from './permissions';
import type { BuiltinRole, Scope } from './types';

export interface Grant {
  readonly permission: PermissionCode;
  readonly scope: Scope;
}

const GLOBAL: Scope = { kind: 'GLOBAL' };
const VERTICAL: Scope = { kind: 'VERTICAL' };
const FROM_POLYGRAPH: Scope = {
  kind: 'VERTICAL_FROM_STAGE',
  stage: 'POLYGRAPH',
};
const OWN: Scope = { kind: 'OWN' };
const OWN_INITIATED_NEW: Scope = { kind: 'OWN_INITIATED_NEW' };
const ASSIGNED: Scope = { kind: 'ASSIGNED' };
const UNASSIGNED_OPEN: Scope = { kind: 'UNASSIGNED_OPEN' };
const SUBMITTED: Scope = { kind: 'SUBMITTED_TO_ME' };

const grant = (scope: Scope, ...permissions: PermissionCode[]): Grant[] =>
  permissions.map((permission) => ({ permission, scope }));

/** Admin holds every permission except those the matrix reserves for other actors (self-assign, HR self-assign). */
const adminExcluded = new Set<PermissionCode>([
  'vacancy.self_assign',
  'polygraph.assign.self',
]);

/** Built-in role → grants, exactly docs/authz-matrix.md §2 (ROLE-04). Custom roles merge into the same shape. */
export const BUILTIN_ROLES: Readonly<Record<BuiltinRole, readonly Grant[]>> = {
  ADMIN: grant(
    GLOBAL,
    ...PERMISSION_CODES.filter((p) => !adminExcluded.has(p)),
  ),
  HEAD_RECRUITER: grant(
    VERTICAL,
    'vacancy.read',
    'vacancy.create',
    'vacancy.update',
    'vacancy.assign_recruiters',
    'vacancy.team_lead.set',
    'vacancy.approve',
    'vacancy.hold',
    'vacancy.resume',
    'vacancy.cancel',
    'vacancy.reopen',
    'vacancy.delete',
    'position.manage',
    'candidate.read',
    'candidate.contacts.read',
    'candidate.transfer_vertical',
    'candidate.create',
    'candidate.update',
    'candidate.bonus_flags.set',
    'candidate.file.read',
    'candidate.file.upload',
    'candidate.merge',
    'candidate.delete',
    'archive.deleted.read',
    'archive.restore',
    'comment.create',
    'application.read',
    'application.create',
    'application.reactivate',
    'application.move.in_work',
    'application.move.submitted_to_tl',
    'application.move.tl_interview',
    'application.interview.manage',
    'application.move.polygraph',
    'application.interview.reject',
    'application.reject.recruiting',
    'application.reject.hr',
    'application.withdraw',
    'application.move_back.recruiting',
    'application.move_back.hr',
    'application.reassign_owner',
    'application.bonus_split.set',
    'offer.read',
    'offer.salary.read',
    'bonus.read',
    'bonus.approve',
    'bonus.hold',
    'bonus.release',
    'bonus.payout_report.read',
    'bonus.payout_report.export',
    'statistics.funnel.read',
    'statistics.hr.read',
    'statistics.bonus.read',
    'statistics.export',
    'user.directory.read',
    'vertical.read',
  ),
  RECRUITER: [
    ...grant(ASSIGNED, 'vacancy.read'),
    ...grant(UNASSIGNED_OPEN, 'vacancy.read', 'vacancy.self_assign'),
    ...grant(
      VERTICAL,
      'vacancy.create',
      'candidate.create',
      'application.create',
      'user.directory.read',
      'vertical.read',
    ),
    ...grant(OWN_INITIATED_NEW, 'vacancy.delete'),
    ...grant(
      OWN,
      'candidate.read',
      'candidate.contacts.read',
      'candidate.update',
      'candidate.bonus_flags.set',
      'candidate.file.read',
      'candidate.file.upload',
      'comment.create',
      'application.read',
      'application.reactivate',
      'application.move.in_work',
      'application.move.submitted_to_tl',
      'application.move.tl_interview',
      'application.interview.manage',
      'application.move.polygraph',
      'application.interview.reject',
      'application.reject.recruiting',
      'application.withdraw',
      'offer.read',
      'offer.salary.read',
      'bonus.read',
      'statistics.funnel.read',
      'statistics.bonus.read',
      'statistics.export',
    ),
  ],
  HEAD_HR: [
    ...grant(
      VERTICAL,
      'vacancy.read',
      'vacancy.probation_length.set',
      'application.reject.hr',
      'application.move_back.hr',
      'polygraph.assign',
      'polygraph.schedule',
      'polygraph.result.record',
      'polygraph.review',
      'offer.draft',
      'offer.send',
      'offer.outcome.record',
      'application.move.probation',
      'probation.length.set',
      'probation.pass',
      'probation.pass.override',
      'probation.fail',
      'statistics.hr.read',
      'statistics.export',
      'user.directory.read',
      'vertical.read',
    ),
    ...grant(
      FROM_POLYGRAPH,
      'candidate.read',
      'candidate.contacts.read',
      'candidate.transfer_vertical',
      'candidate.file.read',
      'comment.create',
      'application.read',
      'polygraph.file.read',
      'offer.read',
      'offer.salary.read',
    ),
  ],
  HR: [
    ...grant(
      VERTICAL,
      'vacancy.read',
      'application.reject.hr',
      'polygraph.assign.self',
      'polygraph.schedule',
      'polygraph.result.record',
      'offer.draft',
      'offer.outcome.record',
      'application.move.probation',
      'user.directory.read',
      'vertical.read',
    ),
    ...grant(
      FROM_POLYGRAPH,
      'candidate.read',
      'candidate.contacts.read',
      'candidate.file.read',
      'comment.create',
      'application.read',
      'polygraph.file.read',
      'offer.read',
      'offer.salary.read',
    ),
    ...grant(OWN, 'statistics.hr.read', 'statistics.export'),
  ],
  TEAM_LEAD: [
    ...grant(
      OWN,
      'vacancy.read',
      'vacancy.update',
      'vacancy.hold',
      'vacancy.resume',
      'vacancy.cancel',
      'statistics.funnel.read',
      'statistics.export',
    ),
    ...grant(
      VERTICAL,
      'vacancy.create',
      'user.directory.read',
      'vertical.read',
    ),
    ...grant(
      SUBMITTED,
      'candidate.read',
      'candidate.file.read',
      'comment.create',
      'application.read',
      'application.tl_decision',
      'application.interview.reschedule_request',
      'application.move.polygraph',
      'application.interview.reject',
      'offer.read',
      'offer.salary.read',
      'probation.pass',
      'probation.fail',
    ),
  ],
  /** Finance is global and confined to Statistics (STAT-08, D12, D41). */
  FINANCE: grant(
    GLOBAL,
    'statistics.funnel.read',
    'statistics.hr.read',
    'statistics.bonus.read',
    'statistics.export',
    'bonus.payout_report.read',
    'bonus.payout_report.export',
  ),
};

/** The only roles that may be assigned without a vertical (D40); custom roles are always vertical-bound. */
export const GLOBAL_ROLES: ReadonlySet<BuiltinRole> = new Set([
  'ADMIN',
  'FINANCE',
]);
