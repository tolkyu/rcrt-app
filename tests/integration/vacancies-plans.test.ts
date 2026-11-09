import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { SQL } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import { vacancyListQuerySchema } from '../../lib/schemas/vacancy';
import { buildAuthContext } from '../../server/authz/context';
import type { UserId } from '../../server/authz/types';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { VacancyStatus } from '../../server/authz/types';
import { vacancyReadWhere } from '../../server/authz/vacancy-scope';
import * as schema from '../../server/db/schema';
import { listVacancies } from '../../server/repositories/vacancy';
import { userHasOpenVacancyWork } from '../../server/repositories/vacancy-work';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const ROWS = 30_000;
const ids = {
  v1: randomUUID(),
  v2: randomUUID(),
  v3: randomUUID(),
  position1: randomUUID(),
  position2: randomUUID(),
  position3: randomUUID(),
  creator: randomUUID(),
  lead: randomUUID(),
  recruiter: randomUUID(),
  idle: randomUUID(),
};
const tag = ids.v1.slice(0, 8);
let captured: { query: string; params: unknown[] } | null = null;
const client = postgres(urls.runtime, { max: 1, prepare: false });
const db = drizzle(client, {
  schema,
  logger: {
    logQuery: (query, params) => {
      captured = { query, params };
    },
  },
});

beforeAll(async () => {
  await admin`insert into app.vertical (id, name) values
    (${ids.v1}, ${`Обсяг А ${tag}`}), (${ids.v2}, ${`Обсяг Б ${tag}`}), (${ids.v3}, ${`Обсяг В ${tag}`})`;
  await admin`insert into app.app_user (id, email, full_name) values
    (${ids.creator}, ${`creator.${tag}@fixture.test`}, 'Автор'),
    (${ids.lead}, ${`lead.${tag}@fixture.test`}, 'Тімлід'),
    (${ids.recruiter}, ${`recruiter.${tag}@fixture.test`}, 'Рекрутер'),
    (${ids.idle}, ${`idle.${tag}@fixture.test`}, 'Без роботи')`;
  const positionRow = (id: string, verticalId: string, suffix: string) => {
    const name = `Позиція ${suffix} ${tag}`;
    return {
      id,
      vertical_id: verticalId,
      name,
      name_key: positionNameKey(name),
      created_by: ids.creator,
    };
  };
  await admin`insert into app.position ${admin([
    positionRow(ids.position1, ids.v1, 'А'),
    positionRow(ids.position2, ids.v2, 'Б'),
    positionRow(ids.position3, ids.v3, 'В'),
  ])}`;
  // A mature company: mostly closed history, two broad verticals and one narrow (2%) one, 4% soft-deleted,
  // one Team Lead leading ~40 rows and one recruiter holding the 60 oldest live rows.
  await admin`insert into app.vacancy (vertical_id, position_id, title, team_lead_id, recruiter_initiated,
      status, opened_at, closed_at, cancelled_at, created_by, deleted_at, deleted_by, delete_reason, priority_flag)
    select b.vertical, b.position,
      case when n % 997 = 0 then 'Рідкісний фахівець ' || n else 'Менеджер напряму ' || n end,
      case when n % 701 = 0 then ${ids.lead}::uuid else ${ids.creator}::uuid end,
      false,
      b.status, now(), case when b.status in ('FILLED', 'CANCELLED') then now() end,
      case when b.status = 'CANCELLED' then now() end,
      ${ids.creator},
      case when (n / 7) % 25 = 0 then now() end,
      case when (n / 7) % 25 = 0 then ${ids.creator}::uuid end,
      case when (n / 7) % 25 = 0 then 'Дубль' end,
      case when (n / 11) % 40 = 0 then 'URGENT' else 'NORMAL' end
    from (
      select n,
        case when n % 50 = 0 then ${ids.v3}::uuid when n % 2 = 0 then ${ids.v1}::uuid else ${ids.v2}::uuid end as vertical,
        case when n % 50 = 0 then ${ids.position3}::uuid when n % 2 = 0 then ${ids.position1}::uuid else ${ids.position2}::uuid end as position,
        case (n / 3) % 20 when 0 then 'OPEN' when 1 then 'ON_HOLD' when 2 then 'DRAFT' when 3 then 'OPEN'
          when 4 then 'CANCELLED' when 5 then 'CANCELLED' else 'FILLED' end as status
      from generate_series(1, ${ROWS}) n
    ) b`;
  await admin`update app.vacancy set opened_at = null where status = 'DRAFT' and vertical_id in (${ids.v1}, ${ids.v2}, ${ids.v3})`;
  await admin`update app.vacancy set position_id = null where status = 'DRAFT' and vertical_id in (${ids.v1}, ${ids.v2}, ${ids.v3})`;
  await admin`insert into app.vacancy_recruiter (vacancy_id, user_id, assigned_by)
    select id, ${ids.recruiter}::uuid, ${ids.creator}::uuid from app.vacancy
    where vertical_id in (${ids.v1}, ${ids.v2}, ${ids.v3}) and team_lead_id = ${ids.creator} and deleted_at is null
    order by public_no asc limit 60`;
  await admin`vacuum (analyze) app.vacancy`;
  await admin`vacuum (analyze) app.vacancy_recruiter`;
});

afterAll(async () => {
  const verticals = admin(Object.values(ids).slice(0, 3));
  await admin`delete from app.vacancy_recruiter where vacancy_id in (select id from app.vacancy where vertical_id in ${verticals})`;
  await admin`delete from app.vacancy where vertical_id in ${verticals}`;
  await admin`delete from app.position where id in ${admin(Object.values(ids).slice(3, 6))}`;
  await admin`delete from app.app_user where id in ${admin(Object.values(ids).slice(6))}`;
  await admin`delete from app.vertical where id in ${verticals}`;
  await Promise.all([admin.end(), client.end()]);
});

const scopeFor = (
  userId: string,
  roles: { role: string; verticalId: string | null }[],
  status?: VacancyStatus,
): SQL =>
  vacancyReadWhere(
    buildAuthContext({
      userId: userId as UserId,
      roles,
      aal: 'aal2',
      timezone: 'Europe/Kyiv',
    }),
    status,
  );

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

/** Runs the repository statement under EXPLAIN ANALYZE with the exact parameters it emitted. */
async function plan(run: () => Promise<unknown>) {
  captured = null;
  await run();
  const { query, params } = captured!;
  const [row] = await admin.unsafe(
    `explain (analyze, format json) ${query}`,
    params as postgres.ParameterOrJSON<never>[],
  );
  const root = (
    row!['QUERY PLAN'] as { Plan: PlanNode; 'Execution Time': number }[]
  )[0]!;
  const nodes: PlanNode[] = [];
  const walk = (node: PlanNode) => {
    nodes.push(node);
    node.Plans?.forEach(walk);
  };
  walk(root.Plan);
  return {
    time: root['Execution Time'],
    indexes: new Set(nodes.flatMap((n) => n['Index Name'] ?? [])),
    seqScans: nodes.filter(
      (n) => n['Node Type'] === 'Seq Scan' && n['Relation Name'] === 'vacancy',
    ),
  };
}

const list =
  (scope: SQL, filters: Record<string, unknown> = {}) =>
  () =>
    listVacancies(
      db,
      scope,
      vacancyListQuerySchema.parse({ limit: 25, ...filters }),
    );

describe('vacancy list query plans on 30k rows [PERF-02, PERF-05]', () => {
  const admin_ = () =>
    scopeFor(ids.creator, [{ role: 'ADMIN', verticalId: null }]);
  const head = (verticalId: string, status?: VacancyStatus) =>
    scopeFor(ids.creator, [{ role: 'HEAD_RECRUITER', verticalId }], status);

  it('serves the unfiltered Admin page and a broad vertical from the ordered number index without scanning the table', async () => {
    for (const run of [
      list(admin_()),
      list(head(ids.v1)),
      list(head(ids.v1, 'FILLED'), { status: 'FILLED' }),
    ]) {
      const result = await plan(run);
      expect(result.seqScans).toEqual([]);
      expect(result.time).toBeLessThan(100);
    }
  });

  it('uses a vertical or open-status index for a narrow vertical with a status filter', async () => {
    const result = await plan(list(head(ids.v3, 'OPEN'), { status: 'OPEN' }));
    // The partial OPEN index (V2b) may beat the vertical ordering index for a narrow vertical; either avoids a table scan.
    expect(
      ['vacancy_vertical_list_idx', 'vacancy_position_open_idx'].some((name) =>
        result.indexes.has(name),
      ),
    ).toBe(true);
    expect(result.time).toBeLessThan(100);
    expect(result.seqScans).toEqual([]);
  });

  it('answers the draft list of an author with no drafts through the author index, never by walking the number index [P1]', async () => {
    const result = await plan(
      list(
        scopeFor(
          ids.idle,
          [{ role: 'RECRUITER', verticalId: ids.v1 }],
          'DRAFT',
        ),
        { status: 'DRAFT' },
      ),
    );
    expect(result.indexes).toContain('vacancy_draft_author_idx');
    expect(result.indexes).not.toContain('vacancy_public_no_uq');
    expect(result.seqScans).toEqual([]);
    expect(result.time).toBeLessThan(10);
  });

  it('keeps the draft list of an author with many drafts off a table scan', async () => {
    const result = await plan(
      list(
        scopeFor(ids.creator, [{ role: 'ADMIN', verticalId: null }], 'DRAFT'),
        {
          status: 'DRAFT',
        },
      ),
    );
    expect(result.seqScans).toEqual([]);
    expect(result.time).toBeLessThan(100);
  });

  it('keeps a status filter other than DRAFT free of the draft arm', () => {
    const roles = [{ role: 'ADMIN', verticalId: null }];
    const sqlOf = (status?: VacancyStatus) =>
      new PgDialect().sqlToQuery(scopeFor(ids.creator, roles, status)).sql;
    expect(sqlOf('OPEN')).not.toContain('"created_by"');
    expect(sqlOf('DRAFT')).not.toContain('<>');
    expect(sqlOf()).toContain('"created_by"');
    expect(sqlOf()).toContain('<>');
  });

  it('finds a Team Lead own vacancies through the team lead index', async () => {
    const result = await plan(
      list(scopeFor(ids.lead, [{ role: 'TEAM_LEAD', verticalId: ids.v1 }])),
    );
    expect(result.indexes).toContain('vacancy_team_lead_list_idx');
    expect(result.seqScans).toEqual([]);
  });

  it('answers recruiter lists, including a recruiter with no work in a narrow vertical, without a table scan', async () => {
    for (const [userId, verticalId] of [
      [ids.recruiter, ids.v1],
      [ids.idle, ids.v3],
      [ids.idle, ids.v1],
    ] as const) {
      const result = await plan(
        list(scopeFor(userId, [{ role: 'RECRUITER', verticalId }])),
      );
      expect(result.seqScans).toEqual([]);
      expect(result.time).toBeLessThan(100);
    }
  });

  it('uses the trigram index for a selective title search and an index for a vacancy number', async () => {
    const search = await plan(list(admin_(), { q: 'Рідкісний фахівець' }));
    expect(search.indexes).toContain('vacancy_title_trgm_idx');
    expect(search.seqScans).toEqual([]);
    const [noRow] =
      await admin`select public_no::text as no from app.vacancy where vertical_id = ${ids.v1} limit 1`;
    const no = noRow!.no as string;
    const byNumber = await plan(list(admin_(), { q: `V-${no}` }));
    expect(byNumber.indexes).toContain('vacancy_public_no_uq');
    expect(byNumber.seqScans).toEqual([]);
  });

  it('pages by keyset in both directions without a table scan', async () => {
    const [noRow] = await admin`select public_no::text as no from app.vacancy
      where vertical_id in (${ids.v1}, ${ids.v2}) order by public_no desc offset 9000 limit 1`;
    const no = noRow!.no as string;
    for (const direction of ['older', 'newer'] as const) {
      const result = await plan(list(admin_(), { cursor: no, direction }));
      expect(result.seqScans).toEqual([]);
      expect(result.time).toBeLessThan(100);
    }
  });

  it('answers the open-work guard through the team lead and assignment indexes', async () => {
    for (const userId of [ids.lead, ids.recruiter, ids.idle]) {
      const result = await plan(() => userHasOpenVacancyWork(db, userId));
      expect(result.seqScans).toEqual([]);
    }
  });
});

describe('vacancy keyset pages [VAC-04]', () => {
  const scope = () =>
    scopeFor(ids.creator, [{ role: 'HEAD_RECRUITER', verticalId: ids.v3 }]);
  const page = (filters: Record<string, unknown>) =>
    listVacancies(
      db,
      scope(),
      vacancyListQuerySchema.parse({ limit: 100, ...filters }),
    );

  it('walks the whole narrow vertical newest-first with consistent navigation flags', async () => {
    const [liveRow] = await admin`select count(*)::int as live from app.vacancy
      where vertical_id = ${ids.v3} and deleted_at is null`;
    const live = liveRow!.live as number;
    const seen: string[] = [];
    let cursor: string | undefined;
    let first = true;
    for (let guard = 0; guard < 20; guard += 1) {
      const result = await page({ cursor });
      expect(result.hasNewer).toBe(!first);
      first = false;
      const numbers = result.items.map((item) => BigInt(item.publicNo));
      expect(numbers).toEqual(
        [...numbers].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)),
      );
      seen.push(...result.items.map((item) => item.publicNo));
      if (!result.hasOlder) break;
      expect(result.items).toHaveLength(100);
      cursor = result.items.at(-1)!.publicNo;
    }
    expect(seen).toHaveLength(live);
    expect(new Set(seen).size).toBe(live);
  });

  it('returns the page just above a cursor when navigating to newer rows and marks the boundaries', async () => {
    const all = await page({ limit: 100 });
    const second = await page({ cursor: all.items.at(-1)!.publicNo });
    const back = await page({
      cursor: second.items[0]!.publicNo,
      direction: 'newer',
    });
    expect(back.items.map((i) => i.id)).toEqual(all.items.map((i) => i.id));
    expect(back.hasNewer).toBe(false);
    expect(back.hasOlder).toBe(true);
    const near = await page({
      cursor: all.items[10]!.publicNo,
      direction: 'newer',
      limit: 25,
    });
    expect(near.items.map((i) => i.id)).toEqual(
      all.items.slice(0, 10).map((i) => i.id),
    );
    expect(near.hasNewer).toBe(false);
  });

  it('treats a cursor outside the visible set as a plain position instead of failing', async () => {
    const [noRow] =
      await admin`select public_no::text as no from app.vacancy where vertical_id = ${ids.v1} order by public_no desc offset 5000 limit 1`;
    const no = noRow!.no as string;
    const older = await page({ cursor: no });
    const expected = await admin`select public_no::text as no from app.vacancy
      where vertical_id = ${ids.v3} and deleted_at is null and public_no < ${no}::bigint
      order by public_no desc limit 100`;
    expect(older.items.map((item) => item.publicNo)).toEqual(
      expected.map((row) => row.no),
    );
    expect(older.hasNewer).toBe(true);
    const newer = await page({ cursor: no, direction: 'newer', limit: 25 });
    expect(
      newer.items.every((item) => BigInt(item.publicNo) > BigInt(no)),
    ).toBe(true);
    const past = await page({
      cursor: '9223372036854775807',
      direction: 'newer',
    });
    expect(past.items).toEqual([]);
  });
});
