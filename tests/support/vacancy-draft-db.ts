import { DEMO_VERTICALS, demoId } from '../../server/db/seed';
import { demoPositionId } from '../../server/db/seed/vacancies';
import { withOwner } from './vacancy-request-db';

export type DraftAuthor =
  'recruiter1.gambling@demo' | 'recruiter2.gambling@demo';

export interface DraftSeed {
  author: DraftAuthor;
  title: string;
  withPosition?: boolean;
  status?: 'DRAFT' | 'CANCELLED';
  headcount?: number;
  priority?: 'NORMAL' | 'URGENT';
  seniority?: string;
  location?: string;
  salaryMinMinor?: string;
  salaryMaxMinor?: string;
  salaryCurrency?: string;
}

/** The row a Recruiter's create leaves (self-assigned, never opened), without spending the shared per-user write limit on setup. */
export function seedDraft({
  author,
  title,
  withPosition = true,
  status = 'DRAFT',
  headcount = 1,
  priority = 'NORMAL',
  seniority,
  location,
  salaryMinMinor,
  salaryMaxMinor,
  salaryCurrency,
}: DraftSeed) {
  const authorId = demoId(`user:${author}`);
  const positionId = withPosition
    ? demoPositionId('gambling-media-buyer-facebook')
    : null;
  const closedAt = status === 'CANCELLED' ? new Date().toISOString() : null;
  return withOwner(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      with created as (
        insert into app.vacancy (
          vertical_id, position_id, title, recruiter_initiated, status, headcount, seniority, location,
          salary_min_minor, salary_max_minor, salary_currency, priority_flag, closed_at, cancelled_at, created_by
        ) values (
          ${DEMO_VERTICALS.gambling}, ${positionId}, ${title}, true, ${status}, ${headcount},
          ${seniority ?? null}, ${location ?? null}, ${salaryMinMinor ?? null}, ${salaryMaxMinor ?? null},
          ${salaryCurrency ?? null}, ${priority}, ${closedAt}, ${closedAt}, ${authorId}
        ) returning id
      ), assigned as (
        insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by)
        select id, ${authorId}, ${authorId} from created
      )
      select id from created`;
    return row!.id;
  });
}

export const removeSeededDraft = (id: string, title: string) =>
  withOwner(
    (sql) => sql`
      update app.vacancy
      set deleted_at = now(), deleted_by = created_by, delete_reason = 'E2E draft cleanup'
      where id = ${id} and title = ${title} and deleted_at is null`,
  );
