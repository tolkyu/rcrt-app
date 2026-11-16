import { DEMO_VACANCIES, demoVacancyId } from '../../server/db/seed/vacancies';
import type { E2EUser } from './e2e-session';

export const vacancyNumber = (position: number) =>
  `V-${String(position).padStart(4, '0')}`;

/** The seed hands out V-0001… in `DEMO_VACANCIES` order on a fresh database. */
export function demoVacancy(position: number) {
  const seed = DEMO_VACANCIES[position - 1]!;
  return {
    id: demoVacancyId(seed.key),
    number: vacancyNumber(position),
    title: seed.title,
    vertical: seed.vertical,
  };
}

/** Drafts that vacancies-create.spec.ts saves for real (and removes again) while other specs run in parallel; list assertions elsewhere ignore them. */
export const E2E_DRAFT_PREFIX = 'Тест E2E чернетка';
export const DELETED_VACANCY = 13;
export const NEWEST_VISIBLE = 14;
/** What «Усі» lists (D110): drafts are not in it, so V-0008 is missing even for its author. */
export const ALL_VISIBLE = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14] as const;
/** V-0008 is Admin's own draft (D92): its card opens for Admin only and it is listed under «Чернетки» only (D110). */
export const DRAFT_VACANCY = 8;

/** Numbers each browser-tested user may open (STORY-VAC-04-1); Finance has none. `tl.crypto@demo` belongs to Newman's session-count checks and is covered by the integration tests. */
export const VISIBLE_VACANCIES: Record<
  Exclude<E2EUser, 'finance@demo'>,
  readonly number[]
> = {
  'admin@demo': ALL_VISIBLE,
  'head.hr@demo': ALL_VISIBLE,
  'hr@demo': ALL_VISIBLE,
  'head.recruiter.gambling@demo': [1, 2, 4, 5, 6, 9, 10, 11],
  'vasyl.tl@demo': [1, 2, 9],
  'taras.tl@demo': [4, 5, 6, 11],
  'recruiter1.gambling@demo': [1, 4, 5, 9, 10, 11],
  'recruiter2.gambling@demo': [1, 2, 5, 6, 11],
  'recruiter.crypto@demo': [3, 7, 12, 14],
};

export const newestFirst = (numbers: readonly number[]) =>
  [...numbers].sort((a, b) => b - a).map(vacancyNumber);
