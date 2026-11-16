import type {
  FormSkeletonHint,
  FormSkeletonRow,
} from '@/components/ui/form-skeleton';

/** Keeps a focused field clear of the sticky footer. */
export const VACANCY_FIELD_CLEARANCE = 'scroll-mb-28';

/** Wrapped lines of the Team Lead hint (a phone / `md` and up); `tests/dev-ui/page-frame-skeleton.spec.ts` compares them with the real field, so change both together. */
export const TEAM_LEAD_HINT_LINES: FormSkeletonHint = { base: 2, md: 1 };

/** Row-for-row twin of the create form's fields (G20); keep it in step with `vacancy-create-form.tsx`. The Team Lead row exists only for those who may set one. */
export const vacancyFormSkeleton = (
  withTeamLead: boolean,
): readonly FormSkeletonRow[] => [
  'group',
  ['input', { kind: 'input', hint: true }],
  { kind: 'input', hint: true },
  [
    { kind: 'input', hint: true },
    { kind: 'segmented', hint: true },
  ],
  ...(withTeamLead
    ? [{ kind: 'input' as const, hint: TEAM_LEAD_HINT_LINES }]
    : []),
];

/** Form column width (the readiness rail of S3.2 sits beside it). */
export const VACANCY_FORM_WIDTH = 'max-w-[45rem]';
