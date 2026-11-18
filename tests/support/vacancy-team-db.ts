import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import { formatVacancyNumber } from '../../lib/schemas/vacancy';
import { DEMO_VERTICALS, demoId } from '../../server/db/seed';
import { demoPositionId } from '../../server/db/seed/vacancies';
import { withOwner } from './vacancy-request-db';

/** Every vacancy these specs insert carries it in the description, so a sweep removes only their own rows (the card never shows the description). */
export const TEAM_MARKER = 'E2E-V3-TEAM';
export const FIXTURE_USER_EMAIL = 'e2e-v3.recruiter@fixture.test';

type Email =
  | 'head.recruiter.gambling@demo'
  | 'recruiter1.gambling@demo'
  | 'recruiter2.gambling@demo'
  | 'vasyl.tl@demo'
  | 'taras.tl@demo';

export interface TeamFixtureSpec {
  title: string;
  status: 'OPEN' | 'ON_HOLD' | 'FILLED';
  /** `null` is a recruiter-initiated vacancy: its author is the first recruiter, or Андрій Бондар when none is assigned. */
  teamLead: 'vasyl.tl@demo' | 'taras.tl@demo' | null;
  recruiters?: readonly Email[];
  urgent?: boolean;
  headcount?: number;
}

export interface TeamFixture {
  id: string;
  number: string;
  title: string;
}

const OPENED_AT = '2026-11-02T09:00:00Z';
export const CLOSED_AT = '2026-11-13T09:00:00Z';
const HEAD = 'head.recruiter.gambling@demo';
const userId = (email: Email | 'admin@demo') => demoId(`user:${email}`);

/** A committed Гемблінг vacancy with fixed dates, so a card shows the same text whatever day the suite runs. */
export function addTeamFixture(spec: TeamFixtureSpec): Promise<TeamFixture> {
  const recruiters = spec.recruiters ?? [];
  const author =
    spec.teamLead ?? recruiters[0] ?? ('recruiter2.gambling@demo' as const);
  return withOwner(async (sql) => {
    const closed = spec.status === 'FILLED' ? CLOSED_AT : null;
    const [row] = await sql<{ id: string; publicNo: string }[]>`
      insert into app.vacancy (
        vertical_id, position_id, title, team_lead_id, recruiter_initiated, status, headcount,
        priority_flag, opened_at, closed_at, created_by, description_doc, created_at, updated_at
      ) values (
        ${DEMO_VERTICALS.gambling}, ${demoPositionId('gambling-media-buyer-facebook')}, ${spec.title},
        ${spec.teamLead ? userId(spec.teamLead) : null}, ${spec.teamLead === null}, ${spec.status},
        ${spec.headcount ?? 1}, ${spec.urgent ? 'URGENT' : 'NORMAL'}, ${OPENED_AT}, ${closed},
        ${userId(author)},
        ${sql.json({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: TEAM_MARKER }] }] })},
        ${OPENED_AT}, ${closed ?? OPENED_AT}
      ) returning id, public_no::text as "publicNo"`;
    for (const email of recruiters)
      await sql`
        insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by, assigned_at)
        values (${row!.id}, ${userId(email)}, ${userId(HEAD)}, ${OPENED_AT})`;
    return {
      id: row!.id,
      number: formatVacancyNumber(BigInt(row!.publicNo)),
      title: spec.title,
    };
  });
}

/** Opened vacancies have no delete route; the sweep soft-deletes the marked rows, and the lists return to the seeded state. */
export const removeTeamFixtures = () =>
  withOwner(
    (sql) => sql`
      update app.vacancy
      set deleted_at = now(), deleted_by = created_by, delete_reason = 'E2E cleanup'
      where deleted_at is null and strpos(description_doc::text, ${TEAM_MARKER}) > 0`,
  );

/** A real cancel stamps the server's clock into the closing day the banner prints; the capture pins it. */
export const pinClosedDay = (id: string) =>
  withOwner(
    (sql) => sql`
      update app.vacancy
      set closed_at = ${CLOSED_AT}, cancelled_at = ${CLOSED_AT}, updated_at = ${CLOSED_AT}
      where id = ${id} and status = 'CANCELLED'`,
  );

export const vacancyStatusOf = (id: string) =>
  withOwner(async (sql) => {
    const [row] = await sql<
      { status: string }[]
    >`select status from app.vacancy where id = ${id}`;
    return row?.status;
  });

/** A third eligible Recruiter of Гемблінг (active, invite accepted), so the picker shows the three rows of the wireframe; the seed has two. */
export const addPickerRecruiter = (fullName: string) =>
  withOwner(async (sql) => {
    const [user] = await sql<{ id: string }[]>`
      insert into app.app_user (email, full_name, activated_at)
      values (${FIXTURE_USER_EMAIL}, ${fullName}, ${FIXED_CLOCK_ISO})
      returning id`;
    await sql`
      insert into app.user_role (user_id, role, vertical_id)
      values (${user!.id}, 'RECRUITER', ${DEMO_VERTICALS.gambling})`;
  });

export const removePickerRecruiter = () =>
  withOwner(async (sql) => {
    await sql`
      delete from app.user_role
      where user_id in (select id from app.app_user where email = ${FIXTURE_USER_EMAIL})`;
    await sql`delete from app.app_user where email = ${FIXTURE_USER_EMAIL}`;
  });
