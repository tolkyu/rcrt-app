import type {
  FormSkeletonNote,
  FormSkeletonRow,
  FormSkeletonTextHint,
} from '@/components/ui/form-skeleton';
import {
  VACANCY_PROBATION_DEFAULT,
  VACANCY_PROBATION_MAX,
  VACANCY_PROBATION_MIN,
} from '@/lib/vacancy-options';

export const TEAM_LEAD_HINT: FormSkeletonTextHint = {
  message: 'vacancyForm.teamLead.hint',
};
const SALARY_HINT: FormSkeletonTextHint = {
  message: 'vacancyForm.salary.hint',
};
export const PROBATION_READ_ONLY_HINT: FormSkeletonTextHint = {
  message: 'vacancyForm.probation.readOnly',
  values: { days: VACANCY_PROBATION_DEFAULT },
};
export const PROBATION_HINT: FormSkeletonTextHint = {
  message: 'vacancyForm.probation.hint',
  values: {
    min: VACANCY_PROBATION_MIN,
    max: VACANCY_PROBATION_MAX,
    standard: VACANCY_PROBATION_DEFAULT,
  },
};

/** The line the rail replaces below the rail breakpoint uses the same role-specific copy. */
export const vacancyAfterCreateSkeleton = (
  assigner: boolean,
): FormSkeletonNote => ({
  note: {
    message: assigner
      ? 'vacancyForm.rail.afterCreateAssigner'
      : 'vacancyForm.rail.afterCreateSelf',
  },
  railHidden: true,
});

/** Group «Умови»: the probation field for Admin, otherwise the read-only line. */
export const vacancyConditionsSkeleton = (
  withProbation: boolean,
): readonly FormSkeletonRow[] => [
  'group',
  ['input', 'input'],
  ['input', 'input'],
  { trio: ['input', 'input', 'input'], hint: SALARY_HINT },
  withProbation
    ? [{ kind: 'input', hint: PROBATION_HINT }]
    : { note: PROBATION_READ_ONLY_HINT },
];

/** Row-for-row twin of the create form's fields (G20); keep it in step with `vacancy-create-form.tsx`. The Team Lead row exists only for those who may set one (the same people get the «Рекрутерів призначте…» note). */
export const vacancyFormSkeleton = (
  withTeamLead: boolean,
  withProbation: boolean,
): readonly FormSkeletonRow[] => [
  'group',
  ['input', { kind: 'input', hint: true }],
  { kind: 'input', hint: true },
  [
    { kind: 'input', hint: true },
    { kind: 'segmented', hint: true },
  ],
  ...(withTeamLead ? [{ kind: 'input' as const, hint: TEAM_LEAD_HINT }] : []),
  ...vacancyConditionsSkeleton(withProbation),
  vacancyAfterCreateSkeleton(withTeamLead),
];
