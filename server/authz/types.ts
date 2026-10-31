export type UserId = string & { readonly __brand: 'UserId' };
export type VerticalId = string & { readonly __brand: 'VerticalId' };

export const BUILTIN_ROLE_CODES = [
  'ADMIN',
  'HEAD_RECRUITER',
  'RECRUITER',
  'HEAD_HR',
  'HR',
  'TEAM_LEAD',
  'FINANCE',
] as const;
export type BuiltinRole = (typeof BUILTIN_ROLE_CODES)[number];
export type RoleCode = BuiltinRole | `custom:${string}`;

/** Ordinal order of pipeline stages; `max_stage_reached` comparisons use these positions. */
export const STAGES = [
  'NEW',
  'IN_WORK',
  'SUBMITTED_TO_TL',
  'TL_INTERVIEW',
  'POLYGRAPH',
  'OFFER',
  'PROBATION',
  'PROBATION_PASSED',
  'REJECTED',
  'WITHDRAWN',
  'PROBATION_FAILED',
] as const;
export type Stage = (typeof STAGES)[number];
export const stageOrdinal = (stage: Stage): number => STAGES.indexOf(stage);

export type VacancyStatus =
  'DRAFT' | 'OPEN' | 'ON_HOLD' | 'FILLED' | 'CANCELLED';

export type Scope =
  | { readonly kind: 'GLOBAL' }
  | { readonly kind: 'VERTICAL' }
  | { readonly kind: 'VERTICAL_FROM_STAGE'; readonly stage: Stage }
  | { readonly kind: 'OWN' }
  | { readonly kind: 'OWN_EARLY' }
  | { readonly kind: 'ASSIGNED' }
  | { readonly kind: 'UNASSIGNED_OPEN' }
  | { readonly kind: 'SUBMITTED_TO_ME' };
export type ScopeKind = Scope['kind'];

export interface RoleAssignment {
  readonly role: RoleCode;
  readonly verticalId: VerticalId | null;
}

export type ResourceType =
  | 'vacancy'
  | 'candidate'
  | 'application'
  | 'bonus_tranche'
  | 'statistics'
  | 'settings'
  | 'vertical'
  | 'user';

export interface VacancyRef {
  readonly type: 'vacancy';
  readonly id: string;
  readonly verticalId: VerticalId;
  readonly status: VacancyStatus;
  readonly teamLeadId: UserId | null;
  readonly createdBy: UserId;
  readonly assignedRecruiterIds: readonly UserId[];
  readonly maxApplicationStage: Stage | null;
}
export interface ApplicationRef {
  readonly type: 'application';
  readonly id: string;
  readonly verticalId: VerticalId;
  readonly stage: Stage;
  readonly maxStageReached: Stage;
  readonly ownerId: UserId;
  readonly sourcerId: UserId;
  readonly teamLeadId: UserId | null;
}
export interface CandidateRef {
  readonly type: 'candidate';
  readonly id: string;
  readonly verticalId: VerticalId;
  readonly sourcerId: UserId;
  readonly ownerId: UserId | null;
  readonly applications: readonly Omit<ApplicationRef, 'type'>[];
}
export interface BonusTrancheRef {
  readonly type: 'bonus_tranche';
  readonly id: string;
  readonly verticalId: VerticalId;
  readonly recipientId: UserId;
}
export interface StatisticsRef {
  readonly type: 'statistics';
  readonly verticalId: VerticalId | null;
  readonly subjectUserId: UserId | null;
}
export interface SettingsRef {
  readonly type: 'settings';
}
export interface VerticalRef {
  readonly type: 'vertical';
  readonly id: VerticalId;
}
/** A directory entry is visible when the user holds any role in one of the caller's verticals. */
export interface UserRef {
  readonly type: 'user';
  readonly id: UserId;
  readonly verticalIds: readonly VerticalId[];
}

export type ResourceRef =
  | VacancyRef
  | ApplicationRef
  | CandidateRef
  | BonusTrancheRef
  | StatisticsRef
  | SettingsRef
  | VerticalRef
  | UserRef;
