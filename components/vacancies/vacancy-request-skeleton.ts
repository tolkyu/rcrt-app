import type {
  FormSkeletonRow,
  FormSkeletonTextHint,
} from '@/components/ui/form-skeleton';

const POSITION_HINT: FormSkeletonTextHint = {
  message: 'vacancyRequest.positionHint',
};

/** Row-for-row twin of `vacancy-request-form.tsx` (G20); keep it in step with that file. */
export const vacancyRequestSkeleton: readonly FormSkeletonRow[] = [
  { kind: 'input', hint: POSITION_HINT },
  { note: 2 },
  [{ kind: 'input', hint: true }, 'segmented'],
  { kind: 'textarea', hint: true },
];

/** Natural widths of «Вийти без збереження» and «Запросити вакансію». */
export const REQUEST_BUTTON_WIDTHS = [
  'min-w-[11.3rem]',
  'min-w-[10.2rem]',
] as const;
