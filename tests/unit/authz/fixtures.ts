import { buildAuthContext, type AuthAssurance } from '@/server/authz/context';
import type {
  ApplicationRef,
  BuiltinRole,
  CandidateRef,
  ResourceRef,
  ResourceType,
  RoleAssignment,
  Stage,
  UserId,
  VacancyRef,
  VerticalId,
} from '@/server/authz/types';

export const ME = 'me-user' as UserId;
export const OTHER = 'other-user' as UserId;
export const GAMBLING = 'vertical-gambling' as VerticalId;
export const CRYPTO = 'vertical-crypto' as VerticalId;
export const ECOMMERCE = 'vertical-ecommerce' as VerticalId;

export const ROLE_COLUMNS: readonly BuiltinRole[] = [
  'ADMIN',
  'HEAD_RECRUITER',
  'RECRUITER',
  'HEAD_HR',
  'HR',
  'TEAM_LEAD',
  'FINANCE',
];
const globalRoles = new Set<BuiltinRole>(['ADMIN', 'FINANCE']);

export function contextFor(
  roles: readonly RoleAssignment[],
  aal: AuthAssurance = 'aal2',
) {
  return buildAuthContext({ userId: ME, roles, aal, timezone: 'Europe/Kyiv' });
}

export const roleContext = (role: BuiltinRole, aal: AuthAssurance = 'aal2') =>
  contextFor(
    [{ role, verticalId: globalRoles.has(role) ? null : GAMBLING }],
    aal,
  );

type AppFacts = Omit<ApplicationRef, 'type'>;
const appFacts = (overrides: Partial<AppFacts> = {}): AppFacts => ({
  id: 'application-1',
  verticalId: GAMBLING,
  stage: 'POLYGRAPH',
  maxStageReached: 'POLYGRAPH',
  ownerId: OTHER,
  sourcerId: OTHER,
  teamLeadId: OTHER,
  ...overrides,
});
const atStage = (stage: Stage, overrides: Partial<AppFacts> = {}) =>
  appFacts({ stage, maxStageReached: stage, ...overrides });

export const vacancy = (overrides: Partial<VacancyRef> = {}): VacancyRef => ({
  type: 'vacancy',
  id: 'vacancy-1',
  verticalId: GAMBLING,
  status: 'OPEN',
  teamLeadId: OTHER,
  createdBy: OTHER,
  assignedRecruiterIds: [OTHER],
  maxApplicationStage: null,
  ...overrides,
});
export const application = (
  overrides: Partial<AppFacts> = {},
): ApplicationRef => ({
  type: 'application',
  ...appFacts(overrides),
});
export const candidate = (
  overrides: Partial<Omit<CandidateRef, 'type'>> = {},
): CandidateRef => ({
  type: 'candidate',
  id: 'candidate-1',
  verticalId: GAMBLING,
  sourcerId: OTHER,
  ownerId: null,
  applications: [appFacts()],
  ...overrides,
});

type Variant =
  | 'base'
  | 'other_vertical'
  | 'from_stage'
  | 'below_stage'
  | 'own'
  | 'own_early'
  | 'own_late'
  | 'assigned'
  | 'unassigned_open'
  | 'unassigned_hold'
  | 'submitted'
  | 'not_submitted'
  | 'max_visible';

/** One resource of the given type shaped for a scope case (docs/test-plan.md §3.1 fixture rules). */
export function fixture(type: ResourceType, variant: Variant): ResourceRef {
  const vertical = variant === 'other_vertical' ? ECOMMERCE : GAMBLING;
  switch (type) {
    case 'settings':
      return { type: 'settings' };
    case 'vertical':
      return { type: 'vertical', id: vertical };
    case 'user':
      return { type: 'user', id: OTHER, verticalIds: [vertical] };
    case 'statistics':
      return {
        type: 'statistics',
        verticalId: vertical,
        subjectUserId:
          variant === 'own' || variant === 'max_visible' ? ME : OTHER,
      };
    case 'bonus_tranche':
      return {
        type: 'bonus_tranche',
        id: 'tranche-1',
        verticalId: vertical,
        recipientId:
          variant === 'own' || variant === 'max_visible' ? ME : OTHER,
      };
    case 'vacancy':
      switch (variant) {
        case 'own':
          return vacancy({ teamLeadId: ME });
        case 'own_early':
          return vacancy({ createdBy: ME, maxApplicationStage: 'IN_WORK' });
        case 'own_late':
          return vacancy({
            createdBy: ME,
            maxApplicationStage: 'TL_INTERVIEW',
          });
        case 'assigned':
          return vacancy({ status: 'ON_HOLD', assignedRecruiterIds: [ME] });
        case 'unassigned_open':
          return vacancy({ assignedRecruiterIds: [] });
        case 'unassigned_hold':
          return vacancy({ status: 'ON_HOLD', assignedRecruiterIds: [] });
        case 'max_visible':
          return vacancy({
            teamLeadId: ME,
            assignedRecruiterIds: [ME],
            maxApplicationStage: 'POLYGRAPH',
          });
        default:
          return vacancy({ verticalId: vertical });
      }
    case 'application':
      switch (variant) {
        case 'own':
          return application({ ownerId: ME });
        case 'below_stage':
          return { type: 'application', ...atStage('TL_INTERVIEW') };
        case 'submitted':
          return {
            type: 'application',
            ...atStage('SUBMITTED_TO_TL', { teamLeadId: ME }),
          };
        case 'not_submitted':
          return {
            type: 'application',
            ...atStage('IN_WORK', { teamLeadId: ME }),
          };
        case 'max_visible':
          return application({ ownerId: ME, teamLeadId: ME });
        default:
          return application({ verticalId: vertical });
      }
    case 'candidate':
      switch (variant) {
        case 'own':
          return candidate({ sourcerId: ME });
        case 'own_early':
          return candidate({
            sourcerId: ME,
            applications: [atStage('IN_WORK')],
          });
        case 'own_late':
          return candidate({
            sourcerId: ME,
            applications: [atStage('TL_INTERVIEW')],
          });
        case 'below_stage':
          return candidate({ applications: [atStage('TL_INTERVIEW')] });
        case 'submitted':
          return candidate({
            applications: [atStage('SUBMITTED_TO_TL', { teamLeadId: ME })],
          });
        case 'not_submitted':
          return candidate({
            applications: [atStage('IN_WORK', { teamLeadId: ME })],
          });
        case 'max_visible':
          return candidate({
            sourcerId: ME,
            applications: [appFacts({ ownerId: ME, teamLeadId: ME })],
          });
        default:
          return candidate({
            verticalId: vertical,
            applications: [appFacts({ verticalId: vertical })],
          });
      }
  }
}

/** Allowed and denied fixtures for one granted matrix cell. */
export function scopeCases(
  type: ResourceType,
  token: string,
): { allowed: ResourceRef[]; denied: ResourceRef[] } {
  switch (token) {
    case 'V':
      return {
        allowed: [fixture(type, 'base')],
        denied: [fixture(type, 'other_vertical')],
      };
    case 'V≥P':
      return {
        allowed: [fixture(type, 'from_stage')],
        denied: [fixture(type, 'below_stage')],
      };
    case 'own':
      return {
        allowed: [fixture(type, 'own')],
        denied: [fixture(type, 'base')],
      };
    case 'own<I':
      return {
        allowed: [fixture(type, 'own_early')],
        denied: [fixture(type, 'own_late')],
      };
    case 'asg+uo':
      return {
        allowed: [fixture(type, 'assigned'), fixture(type, 'unassigned_open')],
        denied: [fixture(type, 'base'), fixture(type, 'unassigned_hold')],
      };
    case 'uo':
      return {
        allowed: [fixture(type, 'unassigned_open')],
        denied: [fixture(type, 'unassigned_hold')],
      };
    case 'sub':
      return {
        allowed: [fixture(type, 'submitted')],
        denied: [fixture(type, 'not_submitted')],
      };
    default:
      throw new Error(`No fixtures for scope token ${token}`);
  }
}
