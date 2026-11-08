import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIXED_CLOCK_ISO } from '../../lib/fixed-clock';
import { DEMO_USERS, kyiv, seedDemo } from '../../server/db/seed/index';
import {
  DEMO_POSITIONS,
  DEMO_VACANCIES,
  demoPositionId,
  demoVacancyId,
  seedDemoVacancies,
} from '../../server/db/seed/vacancies';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const source = {
  APP_ENV: 'local',
  APP_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
  DATABASE_URL: urls.runtime,
  DATABASE_MIGRATION_URL: urls.migration,
};
const vacancyIds = DEMO_VACANCIES.map((v) => demoVacancyId(v.key));
const positionIds = DEMO_POSITIONS.map((p) => demoPositionId(p.key));

async function purgeSeeded() {
  await admin`delete from app.vacancy_recruiter where vacancy_id in ${admin(vacancyIds)}`;
  await admin`delete from app.vacancy where id in ${admin(vacancyIds)}`;
  await admin`delete from app.position where id in ${admin(positionIds)}`;
}

beforeAll(async () => {
  await purgeSeeded();
  await seedDemo(source);
});
afterAll(async () => {
  await purgeSeeded();
  await admin.end();
});

async function state() {
  const [vacancies, positions, assignments, [sequence]] = await Promise.all([
    admin`select to_jsonb(v) as row from app.vacancy v where id in ${admin(vacancyIds)} order by public_no`,
    admin`select to_jsonb(p) as row from app.position p where id in ${admin(positionIds)} order by id`,
    admin`select to_jsonb(r) as row from app.vacancy_recruiter r where vacancy_id in ${admin(vacancyIds)} order by vacancy_id, user_id`,
    admin`select last_value::text as last from app.vacancy_public_no_seq`,
  ]);
  return { vacancies, positions, assignments, sequence: sequence!.last };
}

describe('vacancy demo seed [STORY-SEED-2, STORY-VAC-07-1]', () => {
  it('loads the catalogs and vacancies once and keeps them stable on every re-run', async () => {
    await seedDemoVacancies(source);
    const first = await state();
    expect(first.positions).toHaveLength(DEMO_POSITIONS.length);
    expect(first.vacancies).toHaveLength(DEMO_VACANCIES.length);
    expect(first.assignments).toHaveLength(
      DEMO_VACANCIES.reduce((sum, v) => sum + (v.recruiters?.length ?? 0), 0),
    );

    await seedDemoVacancies(source);
    await seedDemoVacancies(source);
    expect(await state()).toEqual(first);
  });

  it('hands out consecutive public numbers in creation order and never burns numbers on re-runs', async () => {
    await seedDemoVacancies(source);
    const rows =
      await admin`select id, public_no::int as no, created_at from app.vacancy
      where id in ${admin(vacancyIds)} order by public_no`;
    expect(rows.map((r) => r.id)).toEqual(vacancyIds);
    expect(rows.at(-1)!.no - rows[0]!.no).toBe(rows.length - 1);
    const times = rows.map((r) => (r.created_at as Date).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('does not overwrite or resurrect data changed after seeding', async () => {
    await seedDemoVacancies(source);
    const edited = demoVacancyId('vasyl-facebook-senior');
    const unassigned = demoVacancyId('taras-affiliate-unassigned');
    await admin`update app.vacancy set title = 'Змінена назва', status = 'ON_HOLD', version = version + 1
      where id = ${edited}`;
    await admin`delete from app.vacancy_recruiter where vacancy_id = ${edited}`;
    await admin`insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by)
      select ${unassigned}, id, id from app.app_user where email = 'recruiter2.gambling@demo'`;
    await admin`update app.position set name = 'Перейменована' where id = ${demoPositionId('crypto-trader')}`;
    const before = await state();

    await seedDemoVacancies(source);
    expect(await state()).toEqual(before);
    await purgeSeeded();
    await seedDemoVacancies(source);
  });

  it('covers the demo scopes without inventing closed hires, applications or events', async () => {
    await seedDemoVacancies(source);
    const rows =
      await admin`select v.*, t.email as tl_email, vt.name as vertical
      from app.vacancy v join app.vertical vt on vt.id = v.vertical_id
      left join app.app_user t on t.id = v.team_lead_id where v.id in ${admin(vacancyIds)}`;
    const statuses = new Set(rows.map((r) => r.status));
    expect(statuses).toEqual(
      new Set(['DRAFT', 'OPEN', 'ON_HOLD', 'CANCELLED']),
    );
    expect(
      rows.filter((r) => r.priority_flag === 'URGENT').length,
    ).toBeGreaterThan(0);
    expect(rows.some((r) => r.source === 'TELEGRAM_BOT')).toBe(true);
    expect(rows.filter((r) => r.deleted_at !== null)).toHaveLength(1);
    expect(
      rows.some((r) => r.team_lead_id === null && r.recruiter_initiated),
    ).toBe(true);
    expect(rows.some((r) => (r.title as string).length > 120)).toBe(true);
    expect(new Set(rows.map((r) => r.vertical))).toEqual(
      new Set(['Гемблінг', 'Крипто']),
    );
    for (const email of ['vasyl.tl@demo', 'taras.tl@demo', 'tl.crypto@demo'])
      expect(rows.filter((r) => r.tl_email === email).length).toBeGreaterThan(
        1,
      );
    expect(
      new Set(
        rows.filter((r) => r.tl_email === 'vasyl.tl@demo').map((r) => r.status),
      ),
    ).toEqual(new Set(['DRAFT', 'OPEN', 'ON_HOLD']));
    expect(
      new Set(
        rows.filter((r) => r.tl_email === 'taras.tl@demo').map((r) => r.status),
      ),
    ).toContain('CANCELLED');
    const [eventsRow] =
      await admin`select count(*)::int as events from app.entity_event where vacancy_id is not null`;
    const events = eventsRow!.events as number;
    expect(events).toBe(0);
  });

  it('only uses role-compatible active participants whose accounts already existed', async () => {
    await seedDemoVacancies(source);
    const leads = await admin`select v.id from app.vacancy v
      where v.id in ${admin(vacancyIds)} and v.team_lead_id is not null and (
        not exists (select 1 from app.user_role r
          where r.user_id = v.team_lead_id and r.role = 'TEAM_LEAD' and r.vertical_id = v.vertical_id)
        or not (select is_active from app.app_user where id = v.team_lead_id))`;
    expect(leads).toEqual([]);
    const assigned =
      await admin`select r.vacancy_id, r.assigned_at, r.assigned_by, r.user_id, v.created_at
      from app.vacancy_recruiter r join app.vacancy v on v.id = r.vacancy_id
      where r.vacancy_id in ${admin(vacancyIds)} and (
        not exists (select 1 from app.user_role x where x.user_id = r.user_id
          and x.role in ('RECRUITER', 'HEAD_RECRUITER') and x.vertical_id = v.vertical_id)
        or not (select is_active from app.app_user where id = r.user_id)
        or r.assigned_at < v.created_at
        or r.assigned_at < (select accepted_at from app.user_invite i
          where i.user_id = r.user_id and i.status = 'ACCEPTED')
        or not (r.assigned_by = r.user_id or exists (select 1 from app.user_role y
          where y.user_id = r.assigned_by and y.role in ('ADMIN', 'HEAD_RECRUITER')))
      )`;
    expect(assigned).toEqual([]);
  });

  it('keeps every timestamp inside the seeded 30.10 to 02.11 history and before the screenshot clock', async () => {
    await seedDemoVacancies(source);
    const earliest = DEMO_USERS.map((u) => u.invitedAt.getTime()).reduce(
      (a, b) => Math.min(a, b),
    );
    const latest = kyiv('2026-11-02T23:59:59').getTime();
    expect(latest).toBeLessThan(new Date(FIXED_CLOCK_ISO).getTime());
    const stamps = await admin`
      select created_at as at from app.position where id in ${admin(positionIds)}
      union all select updated_at from app.position where id in ${admin(positionIds)}
      union all select created_at from app.vacancy where id in ${admin(vacancyIds)}
      union all select updated_at from app.vacancy where id in ${admin(vacancyIds)}
      union all select opened_at from app.vacancy where id in ${admin(vacancyIds)} and opened_at is not null
      union all select closed_at from app.vacancy where id in ${admin(vacancyIds)} and closed_at is not null
      union all select deleted_at from app.vacancy where id in ${admin(vacancyIds)} and deleted_at is not null
      union all select assigned_at from app.vacancy_recruiter where vacancy_id in ${admin(vacancyIds)}`;
    for (const { at } of stamps) {
      expect((at as Date).getTime()).toBeGreaterThanOrEqual(earliest);
      expect((at as Date).getTime()).toBeLessThanOrEqual(latest);
    }
    const ordering = await admin`select count(*)::int as bad from app.vacancy v
      where v.id in ${admin(vacancyIds)} and (
        v.updated_at < v.created_at
        or v.opened_at < v.created_at
        or v.closed_at < v.opened_at
        or v.deleted_at < v.created_at
        or exists (select 1 from app.position p where p.id = v.position_id and p.created_at > v.created_at))`;
    expect(ordering[0]!.bad).toBe(0);
  });

  it('refuses a hosted target, a database holding real users, and a database without the demo accounts', async () => {
    await expect(
      seedDemoVacancies({
        ...source,
        DATABASE_URL:
          'postgresql://app_rw:secret@db.example.supabase.co:5432/postgres',
        DATABASE_MIGRATION_URL:
          'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
      }),
    ).rejects.toThrow();

    const before = await state();
    const realUser = randomUUID();
    await admin`insert into app.app_user (id, email, full_name)
      values (${realUser}, ${`person.${realUser}@example.com`}, 'Справжня Людина')`;
    try {
      await expect(seedDemoVacancies(source)).rejects.toThrow(/non-demo users/);
    } finally {
      await admin`delete from app.app_user where id = ${realUser}`;
    }
    expect(await state()).toEqual(before);

    await purgeSeeded();
    await admin`update app.app_user set email = 'taras.moved@demo' where email = 'taras.tl@demo'`;
    try {
      await expect(seedDemoVacancies(source)).rejects.toThrow(/run db:seed/);
    } finally {
      await admin`update app.app_user set email = 'taras.tl@demo' where email = 'taras.moved@demo'`;
    }
    const [rowsRow] =
      await admin`select (select count(*) from app.position where id in ${admin(positionIds)})::int as rows`;
    const rows = rowsRow!.rows as number;
    expect(rows).toBe(0);
  });
});
