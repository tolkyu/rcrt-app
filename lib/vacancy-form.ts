export type VacancyFormMode = 'DRAFT' | 'PUBLISH';
export type VacancyUrgency = 'NORMAL' | 'URGENT';

/** What the user edits; `headcount` stays text so «abc» and «1e3» can be reported instead of silently coerced. */
export interface VacancyFormValues {
  verticalId: string;
  positionId: string;
  title: string;
  headcount: string;
  priority: VacancyUrgency;
}

export const VACANCY_FORM_FIELDS = [
  'verticalId',
  'positionId',
  'title',
  'headcount',
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
  | 'headcountRange';

export type VacancyFormErrors = Partial<
  Record<VacancyFormField, VacancyFormErrorCode>
>;

export const emptyVacancyForm = (verticalId = ''): VacancyFormValues => ({
  verticalId,
  positionId: '',
  title: '',
  headcount: '1',
  priority: 'NORMAL',
});

/** Explicit ids (never `useId`): `<label for>` must survive a streamed hydration. */
export const VACANCY_FIELD_IDS: Readonly<Record<VacancyFormField, string>> = {
  verticalId: 'vacancy-form-vertical',
  positionId: 'vacancy-form-position',
  title: 'vacancy-form-title',
  headcount: 'vacancy-form-headcount',
};
