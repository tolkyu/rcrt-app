import type { FormSkeletonRow } from '@/components/ui/form-skeleton';

/** Row-for-row twin of the create form's fields (G20); keep it in step with `vacancy-create-form.tsx`. */
export const VACANCY_FORM_SKELETON: readonly FormSkeletonRow[] = [
  'group',
  ['input', { kind: 'input', hint: true }],
  { kind: 'input', hint: true },
  [
    { kind: 'input', hint: true },
    { kind: 'segmented', hint: true },
  ],
];

/** Form column width (the readiness rail of S3.2 sits beside it). */
export const VACANCY_FORM_WIDTH = 'max-w-[45rem]';
