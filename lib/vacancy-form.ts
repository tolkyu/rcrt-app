export type VacancyFormMode = 'DRAFT' | 'PUBLISH';
export type VacancyUrgency = 'NORMAL' | 'URGENT';

/** What the user edits; `headcount` stays text so «abc» and «1e3» can be reported instead of silently coerced. */
export interface VacancyFormValues {
  verticalId: string;
  positionId: string;
  title: string;
  headcount: string;
  priority: VacancyUrgency;
  /** `''` = no Team Lead; only an Admin / Head Recruiter field, so any other author keeps it empty. */
  teamLeadId: string;
}

export const VACANCY_FORM_FIELDS = [
  'verticalId',
  'positionId',
  'title',
  'headcount',
  'teamLeadId',
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
  | 'teamLeadInvalid';

export type VacancyFormErrors = Partial<
  Record<VacancyFormField, VacancyFormErrorCode>
>;

export const emptyVacancyForm = (verticalId = ''): VacancyFormValues => ({
  verticalId,
  positionId: '',
  title: '',
  headcount: '1',
  priority: 'NORMAL',
  teamLeadId: '',
});

/** One rule for the form and its loading skeleton: before a vertical is chosen the field is shown (disabled) when any offered vertical allows it; afterwards only where the grant covers that vertical. */
export const teamLeadFieldShown = (
  verticals: readonly { id: string; canSetTeamLead: boolean }[],
  verticalId: string,
) =>
  verticalId
    ? verticals.find((vertical) => vertical.id === verticalId)
        ?.canSetTeamLead === true
    : verticals.some((vertical) => vertical.canSetTeamLead);

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
};
