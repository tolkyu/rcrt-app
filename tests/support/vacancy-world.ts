import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import { positionNameKey } from '../../lib/position-name';

export const WORLD_OPENED_AT = new Date('2026-11-02T09:00:00Z');

type Row = Record<string, string | number | boolean | Date | null>;

/** Committed disposable rows; vacancies carry no events, so `cleanup` can delete everything it created. */
export async function createVacancyWorld(sql: Sql) {
  const tag = randomUUID().slice(0, 8);
  const id = () => randomUUID();
  const verticals = { v1: id(), v2: id() };
  const positions = { p1: id(), p2: id() };
  const names = [
    'admin',
    'finance',
    'head',
    'hr',
    'tlA',
    'tlB',
    'tlC',
    'recA',
    'recB',
    'recC',
    'recD',
    'nobody',
  ] as const;
  const users = Object.fromEntries(names.map((name) => [name, id()])) as Record<
    (typeof names)[number],
    string
  >;
  const created: string[] = [];

  await sql`insert into app.vertical (id, name) values
    (${verticals.v1}, ${`Світ А ${tag}`}), (${verticals.v2}, ${`Світ Б ${tag}`})`;
  await sql`insert into app.app_user ${sql(
    names.map((name) => ({
      id: users[name],
      email: `${name.toLowerCase()}.${tag}@fixture.test`,
      full_name: `Користувач ${name}`,
    })),
  )}`;
  const positionNames = {
    p1: `Медіабаєр ${tag}`,
    p2: `Трейдер ${tag}`,
  };
  await sql`insert into app.position (id, vertical_id, name, name_key, created_by) values
    (${positions.p1}, ${verticals.v1}, ${positionNames.p1}, ${positionNameKey(positionNames.p1)}, ${users.admin}),
    (${positions.p2}, ${verticals.v2}, ${positionNames.p2}, ${positionNameKey(positionNames.p2)}, ${users.admin})`;

  /** Valid OPEN vacancy in the first vertical unless overridden. */
  function vacancyRow(overrides: Row = {}): Row {
    return {
      id: id(),
      vertical_id: verticals.v1,
      position_id: positions.p1,
      title: `Вакансія ${tag}`,
      team_lead_id: users.tlA,
      recruiter_initiated: false,
      status: 'OPEN',
      opened_at: WORLD_OPENED_AT,
      created_by: users.admin,
      ...overrides,
    };
  }

  async function addVacancy(
    overrides: Row = {},
    recruiters: readonly string[] = [],
  ): Promise<string> {
    const row = vacancyRow(overrides);
    const rowId = row.id as string;
    await sql`insert into app.vacancy ${sql(row)}`;
    created.push(rowId);
    if (recruiters.length)
      await sql`insert into app.vacancy_recruiter ${sql(
        recruiters.map((userId) => ({
          vacancy_id: rowId,
          user_id: userId,
          assigned_by: users.admin,
        })),
      )}`;
    return rowId;
  }

  /** Registers rows inserted outside `addVacancy` so `cleanup` removes them. */
  const track = (rowId: string) => void created.push(rowId);

  const closed = { closed_at: WORLD_OPENED_AT };
  const v = {
    assignedOpen: await addVacancy(
      { title: `Призначена ${tag}`, team_lead_id: users.tlA },
      [users.recA],
    ),
    unassignedOpen: await addVacancy({
      title: `Вільна ${tag}`,
      team_lead_id: users.tlA,
    }),
    unassignedOnHold: await addVacancy({
      title: `Пауза ${tag}`,
      status: 'ON_HOLD',
      team_lead_id: users.tlB,
    }),
    recruiterInitiated: await addVacancy(
      {
        title: `Ініційована ${tag}`,
        team_lead_id: null,
        recruiter_initiated: true,
        created_by: users.recB,
      },
      [users.recB],
    ),
    draft: await addVacancy({
      title: `Чернетка ${tag}`,
      status: 'DRAFT',
      opened_at: null,
      team_lead_id: users.tlB,
    }),
    cancelled: await addVacancy(
      {
        title: `Скасована ${tag}`,
        status: 'CANCELLED',
        team_lead_id: users.tlA,
        ...closed,
      },
      [users.recA, users.recD],
    ),
    otherUnassigned: await addVacancy({
      title: `Вільна Б ${tag}`,
      vertical_id: verticals.v2,
      position_id: positions.p2,
      team_lead_id: users.tlC,
    }),
    otherAssigned: await addVacancy(
      {
        title: `Призначена Б ${tag}`,
        vertical_id: verticals.v2,
        position_id: positions.p2,
        team_lead_id: users.tlC,
      },
      [users.recC],
    ),
    deleted: await addVacancy(
      {
        title: `Видалена ${tag}`,
        team_lead_id: users.tlA,
        deleted_at: WORLD_OPENED_AT,
        deleted_by: users.admin,
        delete_reason: 'Дублікат',
      },
      [users.recD],
    ),
  };

  const roles = {
    admin: [{ role: 'ADMIN', verticalId: null }],
    finance: [{ role: 'FINANCE', verticalId: null }],
    head: [{ role: 'HEAD_RECRUITER', verticalId: verticals.v1 }],
    hr: [
      { role: 'HR', verticalId: verticals.v1 },
      { role: 'HR', verticalId: verticals.v2 },
    ],
    tlA: [{ role: 'TEAM_LEAD', verticalId: verticals.v1 }],
    tlB: [{ role: 'TEAM_LEAD', verticalId: verticals.v1 }],
    tlC: [{ role: 'TEAM_LEAD', verticalId: verticals.v2 }],
    recA: [{ role: 'RECRUITER', verticalId: verticals.v1 }],
    recB: [{ role: 'RECRUITER', verticalId: verticals.v1 }],
    recC: [{ role: 'RECRUITER', verticalId: verticals.v2 }],
    recD: [{ role: 'RECRUITER', verticalId: verticals.v1 }],
    nobody: [],
  } as const;

  async function cleanup() {
    await sql`delete from app.vacancy_recruiter where vacancy_id in ${sql(created)}`;
    await sql`delete from app.vacancy where id in ${sql(created)}`;
    await sql`delete from app.position where id in ${sql(Object.values(positions))}`;
    await sql`delete from app.app_user where id in ${sql(Object.values(users))}`;
    await sql`delete from app.vertical where id in ${sql(Object.values(verticals))}`;
  }

  return {
    tag,
    verticals,
    positions,
    users,
    v,
    roles,
    vacancyRow,
    addVacancy,
    track,
    cleanup,
  };
}

export type VacancyWorld = Awaited<ReturnType<typeof createVacancyWorld>>;
