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

export const DELETED_VACANCY = 13;
export const ALL_VISIBLE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Numbers each browser-tested user may open (STORY-VAC-04-1); Finance has none. `tl.crypto@demo` belongs to Newman's session-count checks and is covered by the integration tests. */
export const VISIBLE_VACANCIES: Record<
  Exclude<E2EUser, 'finance@demo'>,
  readonly number[]
> = {
  'admin@demo': ALL_VISIBLE,
  'head.hr@demo': ALL_VISIBLE,
  'hr@demo': ALL_VISIBLE,
  'head.recruiter.gambling@demo': [1, 2, 4, 5, 6, 8, 9, 10, 11],
  'vasyl.tl@demo': [1, 2, 8, 9],
  'taras.tl@demo': [4, 5, 6, 11],
  'recruiter1.gambling@demo': [1, 4, 5, 9, 10, 11],
  'recruiter2.gambling@demo': [1, 2, 5, 6, 11],
  'recruiter.crypto@demo': [3, 7, 12],
};

export const newestFirst = (numbers: readonly number[]) =>
  [...numbers].sort((a, b) => b - a).map(vacancyNumber);
