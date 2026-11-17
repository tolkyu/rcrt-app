import { VACANCY_TITLE_MAX, VACANCY_TITLE_MIN } from '@/lib/vacancy-limits';
import { VACANCY_PROBATION_DEFAULT } from '@/lib/vacancy-options';

export type VacancyFormMode = 'DRAFT' | 'PUBLISH';
export type VacancyUrgency = 'NORMAL' | 'URGENT';

/** What the user edits; numbers stay text so «abc» and «1e3» can be reported instead of silently coerced. */
export interface VacancyFormValues {
  verticalId: string;
  positionId: string;
  title: string;
  headcount: string;
  priority: VacancyUrgency;
  /** `''` = no Team Lead; only an Admin / Head Recruiter field, so any other author keeps it empty. */
  teamLeadId: string;
  /** `''` = not specified (the three selects below and the currency). */
  seniority: string;
  workFormat: string;
  employmentType: string;
  location: string;
  /** Amounts as typed («2 500,50»); parsed to minor units on submit. */
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  /** `''` unless the field is shown (Admin only, D115): the payload then carries no probation key and the server keeps its default. */
  probationDays: string;
}

export const VACANCY_FORM_FIELDS = [
  'verticalId',
  'positionId',
  'title',
  'headcount',
  'teamLeadId',
  'seniority',
  'workFormat',
  'employmentType',
  'location',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
  'probationDays',
] as const;
export type VacancyFormField = (typeof VACANCY_FORM_FIELDS)[number];

/** Keys of `vacancyForm.errors`. */
export type VacancyFormErrorCode =
  | 'verticalRequired'
  | 'positionRequired'
  | 'positionInactive'
  | 'positionInvalid'
  | 'titleRequired'
  | 'titleShort'
  | 'titleLong'
  | 'titleChars'
  | 'headcountRange'
  | 'teamLeadInvalid'
  | 'optionInvalid'
  | 'locationLong'
  | 'locationChars'
  | 'salaryNumber'
  | 'salaryTooLarge'
  | 'salaryMaxBelowMin'
  | 'salaryCurrencyRequired'
  | 'salaryCurrencyNoAmount'
  | 'probationRange';

/** Fields a form may insist on filling in beyond what the mode needs: the edit form cannot express «cleared» for them (a patch has no null for either), so a blank one is this error. */
export const FILLED_CODE = {
  headcount: 'headcountRange',
  probationDays: 'probationRange',
} as const satisfies Partial<Record<VacancyFormField, VacancyFormErrorCode>>;
export type FilledField = keyof typeof FILLED_CODE;

export type VacancyFormErrors = Partial<
  Record<VacancyFormField, VacancyFormErrorCode>
>;

export const emptyVacancyForm = (
  verticalId = '',
  withProbation = false,
): VacancyFormValues => ({
  verticalId,
  positionId: '',
  title: '',
  headcount: '1',
  priority: 'NORMAL',
  teamLeadId: '',
  seniority: '',
  workFormat: '',
  employmentType: '',
  location: '',
  salaryMin: '',
  salaryMax: '',
  salaryCurrency: '',
  probationDays: withProbation ? String(VACANCY_PROBATION_DEFAULT) : '',
});

/** One rule per grant for the form and its loading skeleton: before a vertical is chosen the field is shown when any offered vertical allows it; afterwards only where the grant covers that vertical. */
const grantShown = <Grant extends string>(
  verticals: readonly ({ readonly id: string } & Record<Grant, boolean>)[],
  verticalId: string,
  grant: Grant,
) =>
  verticalId
    ? verticals.find((vertical) => vertical.id === verticalId)?.[grant] === true
    : verticals.some((vertical) => vertical[grant]);

export const teamLeadFieldShown = (
  verticals: readonly {
    readonly id: string;
    readonly canSetTeamLead: boolean;
  }[],
  verticalId: string,
) => grantShown(verticals, verticalId, 'canSetTeamLead');

export const probationFieldShown = (
  verticals: readonly {
    readonly id: string;
    readonly canSetProbation: boolean;
  }[],
  verticalId: string,
) => grantShown(verticals, verticalId, 'canSetProbation');

/** Whether a title of this length (as the server counts it) passes the title rule; the readiness rail and the counter read the same number. */
export const isTitleLengthReady = (length: number) =>
  length >= VACANCY_TITLE_MIN && length <= VACANCY_TITLE_MAX;

export type VerticalResetNote = 'position' | 'teamLead' | 'both';

/** Which of the vertical-bound fields a vertical change cleared; null = nothing to tell the user (ux §2.1). */
export const verticalResetNote = (
  clearedPosition: boolean,
  clearedTeamLead: boolean,
): VerticalResetNote | null =>
  clearedPosition
    ? clearedTeamLead
      ? 'both'
      : 'position'
    : clearedTeamLead
      ? 'teamLead'
      : null;

/** Explicit ids (never `useId`): `<label for>` must survive a streamed hydration. */
export const VACANCY_FIELD_IDS: Readonly<Record<VacancyFormField, string>> = {
  verticalId: 'vacancy-form-vertical',
  positionId: 'vacancy-form-position',
  title: 'vacancy-form-title',
  headcount: 'vacancy-form-headcount',
  teamLeadId: 'vacancy-form-team-lead',
  seniority: 'vacancy-form-seniority',
  workFormat: 'vacancy-form-work-format',
  employmentType: 'vacancy-form-employment-type',
  location: 'vacancy-form-location',
  salaryMin: 'vacancy-form-salary-min',
  salaryMax: 'vacancy-form-salary-max',
  salaryCurrency: 'vacancy-form-salary-currency',
  probationDays: 'vacancy-form-probation',
};
