import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import {
  createVacancyWorld,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const runtime = connectTestDatabase(urls.runtime);
let world: VacancyWorld;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), runtime.end()]);
});

const rollback = Symbol('rollback');
async function rolledBack(
  work: (tx: postgres.TransactionSql) => Promise<void>,
) {
  await admin
    .begin(async (tx) => {
      await work(tx);
      throw rollback;
    })
    .catch((error: unknown) => {
      if (error !== rollback) throw error;
    });
}

function violation(constraint: string, code = '23514') {
  return { code, constraint_name: constraint };
}

describe('vacancy constraints [VAC-01, VAC-07, ADR-012]', () => {
  const cases: [
    string,
    () => Record<string, string | number | boolean | Date | null>,
    string,
  ][] = [
    ['blank title', () => ({ title: '   ' }), 'vacancy_title_chk'],
    ['zero headcount', () => ({ headcount: 0 }), 'vacancy_headcount_chk'],
    [
      'probation below 30 days',
      () => ({ probation_days: 29 }),
      'vacancy_probation_days_chk',
    ],
    [
      'probation above 90 days',
      () => ({ probation_days: 91 }),
      'vacancy_probation_days_chk',
    ],
    ['unknown status', () => ({ status: 'FROZEN' }), 'vacancy_status_chk'],
    [
      'unknown priority',
      () => ({ priority_flag: 'LOW' }),
      'vacancy_priority_chk',
    ],
    ['unknown source', () => ({ source: 'EMAIL' }), 'vacancy_source_chk'],
    [
      'unknown work format',
      () => ({ work_format: 'ABROAD' }),
      'vacancy_work_format_chk',
    ],
    ['zero version', () => ({ version: 0 }), 'vacancy_version_chk'],
    [
      'non-draft without a position',
      () => ({ position_id: null }),
      'vacancy_position_chk',
    ],
    [
      'non-draft without opened_at',
      () => ({ opened_at: null }),
      'vacancy_opened_chk',
    ],
    [
      'no Team Lead on a Team Lead request',
      () => ({ team_lead_id: null }),
      'vacancy_team_lead_chk',
    ],
    [
      'closed_at on an open vacancy',
      () => ({ closed_at: new Date() }),
      'vacancy_closed_chk',
    ],
    [
      'cancelled without closed_at',
      () => ({ status: 'CANCELLED', cancelled_at: new Date() }),
      'vacancy_closed_chk',
    ],
    [
      'cancelled without cancelled_at',
      () => ({ status: 'CANCELLED', closed_at: new Date() }),
      'vacancy_cancelled_chk',
    ],
    [
      'cancelled_at on a vacancy that is not cancelled',
      () => ({ cancelled_at: new Date() }),
      'vacancy_cancelled_chk',
    ],
    [
      'cancelled_at different from closed_at',
      () => ({
        status: 'CANCELLED',
        closed_at: new Date('2026-11-02T09:00:00Z'),
        cancelled_at: new Date('2026-11-03T09:00:00Z'),
      }),
      'vacancy_cancelled_chk',
    ],
    [
      'salary minimum above maximum',
      () => ({
        salary_min_minor: 500,
        salary_max_minor: 100,
        salary_currency: 'USD',
      }),
      'vacancy_salary_chk',
    ],
    [
      'negative salary',
      () => ({ salary_min_minor: -1, salary_currency: 'USD' }),
      'vacancy_salary_chk',
    ],
    [
      'salary without currency',
      () => ({ salary_min_minor: 100 }),
      'vacancy_salary_chk',
    ],
    [
      'currency without salary',
      () => ({ salary_currency: 'USD' }),
      'vacancy_salary_chk',
    ],
    [
      'lower-case currency',
      () => ({ salary_min_minor: 100, salary_currency: 'usd' }),
      'vacancy_salary_chk',
    ],
    [
      'deleted_at without deleted_by',
      () => ({ deleted_at: new Date() }),
      'vacancy_soft_delete_chk',
    ],
    [
      'deletion without a reason',
      () => ({ deleted_at: new Date(), deleted_by: world.users.admin }),
      'vacancy_soft_delete_chk',
    ],
  ];

  it.each(cases)('rejects %s', async (_name, overrides, constraint) => {
    await expect(
      admin`insert into app.vacancy ${admin(world.vacancyRow(overrides()))}`,
    ).rejects.toMatchObject(violation(constraint));
  });

  it('accepts lifecycle and money shapes the services will write', async () => {
    await rolledBack(async (tx) => {
      const base = world.vacancyRow();
      for (const row of [
        {
          ...base,
          id: randomUUID(),
          status: 'DRAFT',
          position_id: null,
          opened_at: null,
        },
        { ...base, id: randomUUID(), status: 'FILLED', closed_at: new Date() },
        {
          ...base,
          id: randomUUID(),
          status: 'CANCELLED',
          position_id: null,
          opened_at: null,
          closed_at: new Date('2026-11-02T09:00:00Z'),
          cancelled_at: new Date('2026-11-02T09:00:00Z'),
        },
        {
          ...base,
          id: randomUUID(),
          team_lead_id: null,
          recruiter_initiated: true,
        },
        {
          ...base,
          id: randomUUID(),
          salary_min_minor: 0,
          salary_max_minor: 9_000_000_000_000,
          salary_currency: 'UAH',
          probation_days: 30,
        },
      ])
        await tx`insert into app.vacancy ${tx(row)}`;
    });
  });

  it('rejects a position from another vertical, a duplicate name key and a blank name', async () => {
    const duplicate = `МЕДІАБАЄР ${world.tag.toUpperCase()}`;
    await expect(
      admin`insert into app.vacancy ${admin(world.vacancyRow({ position_id: world.positions.p2 }))}`,
    ).rejects.toMatchObject(violation('vacancy_position_vertical_fk', '23503'));
    await expect(
      admin`insert into app.position (vertical_id, name, name_key, created_by)
        values (${world.verticals.v1}, ${duplicate}, ${positionNameKey(duplicate)}, ${world.users.admin})`,
    ).rejects.toMatchObject(violation('position_name_uq', '23505'));
    await expect(
      admin`insert into app.position (vertical_id, name, name_key, created_by)
        values (${world.verticals.v1}, '  ', '', ${world.users.admin})`,
    ).rejects.toMatchObject(violation('position_name_chk'));
    await expect(
      admin`insert into app.position (vertical_id, name, created_by)
        values (${world.verticals.v1}, ${`Без ключа ${world.tag}`}, ${world.users.admin})`,
    ).rejects.toMatchObject({ code: '23502', column_name: 'name_key' });
    await rolledBack(async (tx) => {
      const name = `Медіабаєр ${world.tag}`;
      await tx`insert into app.position (vertical_id, name, name_key, created_by)
        values (${world.verticals.v2}, ${name}, ${positionNameKey(name)}, ${world.users.admin})`;
    });
  });

  it('arbitrates duplicates by the stored name key only, whatever the database locale folds [SEC-POS-01]', async () => {
    const name = `Ключ ${world.tag}`;
    await rolledBack(async (tx) => {
      await tx`insert into app.position (vertical_id, name, name_key, created_by)
        values (${world.verticals.v2}, ${name}, ${'ключ-1'}, ${world.users.admin})`;
      // Different case, different key: only the application's fold may equate names, never `lower()`.
      await tx`insert into app.position (vertical_id, name, name_key, created_by)
        values (${world.verticals.v2}, ${name.toUpperCase()}, ${'КЛЮЧ-1'}, ${world.users.admin})`;
      await expect(
        tx`insert into app.position (vertical_id, name, name_key, created_by)
          values (${world.verticals.v2}, ${`Інша ${world.tag}`}, ${'ключ-1'}, ${world.users.admin})`,
      ).rejects.toMatchObject(violation('position_name_uq', '23505'));
    });
  });

  it('keeps assignments unique per vacancy and user and tied to real rows', async () => {
    await expect(
      admin`insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by)
        values (${world.v.assignedOpen}, ${world.users.recA}, ${world.users.admin})`,
    ).rejects.toMatchObject(
      violation('vacancy_recruiter_vacancy_id_user_id_pk', '23505'),
    );
    await expect(
      admin`insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by)
        values (${randomUUID()}, ${world.users.recA}, ${world.users.admin})`,
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('restricts deleting rows that vacancies or positions depend on', async () => {
    await expect(
      admin`delete from app.position where id = ${world.positions.p1}`,
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      admin`delete from app.app_user where id = ${world.users.tlA}`,
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      admin`delete from app.vacancy where id = ${world.v.assignedOpen}`,
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('vacancy numbers [VAC-07, STORY-VAC-07-1]', () => {
  it('allocates unique increasing numbers to concurrent inserts from many connections', async () => {
    const pool = postgres(urls.migration, { max: 12, prepare: false });
    try {
      const rows = await Promise.all(
        Array.from({ length: 60 }, async () => {
          const row = world.vacancyRow();
          const [inserted] = await pool`insert into app.vacancy ${pool(row)}
            returning id, public_no::text as no`;
          world.track(inserted!.id as string);
          return BigInt(inserted!.no as string);
        }),
      );
      expect(new Set(rows).size).toBe(60);
      expect(rows.every((value) => value > 0n)).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it('leaves gaps after a failed transaction and never reuses a number after soft or hard deletion', async () => {
    const insert = async (sql: postgres.Sql | postgres.TransactionSql) => {
      const row = world.vacancyRow();
      const [inserted] =
        await sql`insert into app.vacancy ${sql(row)} returning id, public_no::text as no`;
      world.track(inserted!.id as string);
      return { id: inserted!.id as string, no: BigInt(inserted!.no as string) };
    };
    const first = await insert(admin);
    await rolledBack(async (tx) => {
      await insert(tx);
    });
    const second = await insert(admin);
    expect(second.no).toBeGreaterThan(first.no + 1n);

    await admin`update app.vacancy set deleted_at = now(), deleted_by = ${world.users.admin},
      delete_reason = 'Тест' where id = ${second.id}`;
    const third = await insert(admin);
    expect(third.no).toBeGreaterThan(second.no);
    await admin`delete from app.vacancy where id = ${third.id}`;
    const fourth = await insert(admin);
    expect(fourth.no).toBeGreaterThan(third.no);
  });

  it('refuses explicit and changed numbers', async () => {
    await expect(
      admin`insert into app.vacancy ${admin({ ...world.vacancyRow(), public_no: 77 })}`,
    ).rejects.toMatchObject({ code: '428C9' });
    await expect(
      admin`update app.vacancy set public_no = public_no + 1 where id = ${world.v.assignedOpen}`,
    ).rejects.toMatchObject({ code: '428C9' });
    await expect(
      admin`update app.vacancy set public_no = default where id = ${world.v.assignedOpen}`,
    ).rejects.toMatchObject({
      code: '23514',
      message: 'vacancy_public_no_immutable',
    });
  });
});

describe('vacancy privileges and event link [ADR-012]', () => {
  it('lets the runtime role read and insert vacancies and assignments but never update or delete them (S1)', async () => {
    const [countRow] =
      await runtime`select count(*)::int as count from app.vacancy where id = ${world.v.assignedOpen}`;
    const count = countRow!.count as number;
    expect(count).toBe(1);
    await runtime`select count(*) from app.position`;
    await runtime`select count(*) from app.vacancy_recruiter`;
    for (const statement of [
      runtime`update app.vacancy set title = 'Зміна' where id = ${world.v.assignedOpen}`,
      runtime`delete from app.vacancy where id = ${world.v.assignedOpen}`,
      runtime`delete from app.vacancy_recruiter where vacancy_id = ${world.v.assignedOpen}`,
      runtime`update app.vacancy_recruiter set assigned_by = ${world.users.recA} where vacancy_id = ${world.v.assignedOpen}`,
    ])
      await expect(statement).rejects.toMatchObject({ code: '42501' });
    await rolledBack(async (tx) => {
      await tx`set local role app_rw`;
      await tx`insert into app.vacancy ${tx(world.vacancyRow())}`;
      await tx`insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by) values (${world.v.draft}, ${world.users.recA}, ${world.users.admin})`;
    });
  });

  it('allocates numbers for the future write role without a sequence grant', async () => {
    await rolledBack(async (tx) => {
      await tx`set local role app_rw`;
      const [row] =
        await tx`insert into app.vacancy ${tx(world.vacancyRow())} returning public_no::text as no`;
      expect(BigInt(row!.no as string)).toBeGreaterThan(0n);
    });
  });

  it('ties entity_event.vacancy_id to real vacancies for the append-only runtime writer', async () => {
    await expect(
      admin.begin(async (tx) => {
        await tx`set local role app_rw`;
        await tx`insert into app.entity_event (occurred_at, actor_kind, type, subject_type, subject_id, vacancy_id, payload)
          values (now(), 'SYSTEM', 'user.profile_updated', 'vacancy', 'x', ${randomUUID()}, '{"v":1}')`;
      }),
    ).rejects.toMatchObject(
      violation('entity_event_vacancy_id_vacancy_id_fk', '23503'),
    );
    await rolledBack(async (tx) => {
      await tx`set local role app_rw`;
      await tx`insert into app.entity_event (occurred_at, actor_kind, type, subject_type, subject_id, vacancy_id, payload)
        values (now(), 'SYSTEM', 'user.profile_updated', 'vacancy', 'x', ${world.v.assignedOpen}, '{"v":1}')`;
    });
  });
});

describe('position catalog privileges and version [ADR-013]', () => {
  const created: string[] = [];
  const createdName = (suffix: string) => `Каталог ${suffix} ${world.tag}`;

  afterAll(async () => {
    if (created.length)
      await admin`delete from app.position where id in ${admin(created)}`;
  });

  async function insertAsRuntime(name: string, verticalId: string) {
    const [row] =
      await runtime`insert into app.position (vertical_id, name, name_key, created_by)
      values (${verticalId}, ${name}, ${positionNameKey(name)}, ${world.users.admin}) returning id, version, is_active`;
    created.push(row!.id as string);
    return row!;
  }

  it('lets the runtime role create positions that start at version 1 and active', async () => {
    const row = await insertAsRuntime(
      createdName('створення'),
      world.verticals.v1,
    );
    expect(row.version).toBe(1);
    expect(row.is_active).toBe(true);
  });

  it('lets the runtime role change only name, name_key, is_active, version and updated_at', async () => {
    const row = await insertAsRuntime(createdName('зміна'), world.verticals.v1);
    const [updated] = await runtime`update app.position
      set name = ${createdName('нова назва')}, name_key = ${positionNameKey(createdName('нова назва'))},
        is_active = false, version = version + 1, updated_at = now()
      where id = ${row.id} returning name, name_key, is_active, version`;
    expect(updated).toEqual({
      name: createdName('нова назва'),
      name_key: positionNameKey(createdName('нова назва')),
      is_active: false,
      version: 2,
    });
    for (const assignment of [
      runtime`update app.position set vertical_id = ${world.verticals.v2} where id = ${row.id}`,
      runtime`update app.position set id = ${randomUUID()} where id = ${row.id}`,
      runtime`update app.position set created_by = ${world.users.finance} where id = ${row.id}`,
      runtime`update app.position set created_at = now() where id = ${row.id}`,
    ])
      await expect(assignment).rejects.toMatchObject({ code: '42501' });
    const [unchanged] =
      await admin`select vertical_id from app.position where id = ${row.id}`;
    expect(unchanged!.vertical_id).toBe(world.verticals.v1);
  });

  it('never lets the runtime role delete a position, even an unused one', async () => {
    const row = await insertAsRuntime(
      createdName('видалення'),
      world.verticals.v2,
    );
    await expect(
      runtime`delete from app.position where id = ${row.id}`,
    ).rejects.toMatchObject({ code: '42501' });
    const [still] =
      await admin`select count(*)::int as count from app.position where id = ${row.id}`;
    expect(still!.count).toBe(1);
  });

  it('rejects a non-positive version on insert and update', async () => {
    await expect(
      admin`insert into app.position (vertical_id, name, name_key, created_by, version)
        values (${world.verticals.v1}, ${createdName('нульова')}, ${positionNameKey(createdName('нульова'))}, ${world.users.admin}, 0)`,
    ).rejects.toMatchObject(violation('position_version_chk'));
    const row = await insertAsRuntime(
      createdName('версія'),
      world.verticals.v1,
    );
    await expect(
      runtime`update app.position set version = 0 where id = ${row.id}`,
    ).rejects.toMatchObject(violation('position_version_chk'));
  });

  it('keeps the unique name guard for runtime writes and lets concurrent creates have one winner', async () => {
    const name = createdName('дубль');
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        insertAsRuntime(name, world.verticals.v2),
      ),
    );
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes.filter((o) => o.status === 'rejected'))
      expect(outcome.reason).toMatchObject(
        violation('position_name_uq', '23505'),
      );
  });
});

describe('vacancy indexes [PERF-02, PERF-05]', () => {
  it('declares the live-row partial indexes, trigram search and reverse assignment lookup', async () => {
    const rows = await admin`select indexname, indexdef from pg_indexes
      where schemaname = 'app' and tablename in ('vacancy', 'vacancy_recruiter', 'position')`;
    const definitions = new Map(
      rows.map((row) => [row.indexname as string, row.indexdef as string]),
    );
    for (const name of [
      'vacancy_vertical_list_idx',
      'vacancy_status_list_idx',
      'vacancy_priority_list_idx',
      'vacancy_team_lead_list_idx',
      'vacancy_position_idx',
      'vacancy_title_trgm_idx',
    ]) {
      expect(definitions.get(name), name).toMatch(
        /WHERE \(?deleted_at IS NULL\)?/,
      );
    }
    expect(definitions.get('vacancy_title_trgm_idx')).toMatch(
      /USING gin .*gin_trgm_ops/,
    );
    expect(definitions.get('vacancy_recruiter_user_idx')).toMatch(
      /\(user_id, vacancy_id\)/,
    );
    expect(definitions.get('vacancy_public_no_uq')).toMatch(/UNIQUE/);
  });
});
