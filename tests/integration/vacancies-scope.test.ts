import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  vacancyDetailSchema,
  vacancyListQuerySchema,
} from '../../lib/schemas/vacancy';
import { buildAuthContext } from '../../server/authz/context';
import type { UserId } from '../../server/authz/types';
import { vacancyReadWhere } from '../../server/authz/vacancy-scope';
import type { RequestContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { systemClock } from '../../server/domain/clock';
import { NotFoundError } from '../../server/http/errors';
import { findVacancy, listVacancies } from '../../server/repositories/vacancy';
import { userHasOpenVacancyWork } from '../../server/repositories/vacancy-work';
import {
  getVacancyDetail,
  listVacancyPage,
} from '../../server/services/vacancy';
import {
  WORLD_OPENED_AT,
  createVacancyWorld,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 2, prepare: false });
const db = drizzle(client, { schema });
let world: VacancyWorld;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), client.end()]);
});

type Name = keyof VacancyWorld['users'];
type Key = keyof VacancyWorld['v'];
type Roles = readonly { role: string; verticalId: string | null }[];

const auth = (userId: string, roles: Roles) =>
  buildAuthContext({
    userId: userId as UserId,
    roles,
    aal: 'aal2',
    timezone: 'Europe/Kyiv',
  });
const scopeFor = (userId: string, roles: Roles) =>
  vacancyReadWhere(auth(userId, roles));

/** Rows of this test's world visible through the same scope the list and detail services use; the tag in every title keeps other data and the page size out of the result. */
async function visible(userId: string, roles: Roles): Promise<Key[]> {
  const scope = scopeFor(userId, roles);
  const page = await listVacancies(
    db,
    scope,
    vacancyListQuerySchema.parse({ limit: 100, q: world.tag }),
  );
  const byId = new Map(
    (Object.entries(world.v) as [Key, string][]).map(([key, id]) => [id, key]),
  );
  const keys = page.items.flatMap((item) => byId.get(item.id) ?? []);
  for (const [key, id] of Object.entries(world.v) as [Key, string][]) {
    const detail = await findVacancy(db, scope, id);
    expect(!!detail, `detail ${key}`).toBe(keys.includes(key));
  }
  return keys.sort();
}
const as = (name: Name) => visible(world.users[name], world.roles[name]);
const keys = (...list: Key[]) => [...list].sort();

describe('vacancy.read scope predicates [VIS-01..03, D1, D19, D53]', () => {
  it('GLOBAL: Admin reads every live vacancy and never a soft-deleted one', async () => {
    expect(await as('admin')).toEqual(
      keys(
        'assignedOpen',
        'unassignedOpen',
        'unassignedOnHold',
        'recruiterInitiated',
        'draft',
        'cancelled',
        'otherUnassigned',
        'otherAssigned',
      ),
    );
  });

  it('VERTICAL: Head Recruiter and HR read their verticals only, including closed rows but never a draft they did not write [D92]', async () => {
    expect(await as('head')).toEqual(
      keys(
        'assignedOpen',
        'unassignedOpen',
        'unassignedOnHold',
        'recruiterInitiated',
        'cancelled',
      ),
    );
    expect(await as('hr')).toEqual(
      keys(
        'assignedOpen',
        'unassignedOpen',
        'unassignedOnHold',
        'recruiterInitiated',
        'cancelled',
        'otherUnassigned',
        'otherAssigned',
      ),
    );
  });

  it('OWN: a Team Lead reads only vacancies currently led, in a vertical of the role', async () => {
    expect(await as('tlA')).toEqual(
      keys('assignedOpen', 'unassignedOpen', 'cancelled'),
    );
    expect(await as('tlB')).toEqual(keys('unassignedOnHold'));
    expect(await as('tlC')).toEqual(keys('otherUnassigned', 'otherAssigned'));
  });

  it('OWN: leading a vacancy grants nothing without the Team Lead role in its vertical', async () => {
    expect(
      await visible(world.users.tlA, [
        { role: 'TEAM_LEAD', verticalId: world.verticals.v2 },
      ]),
    ).toEqual([]);
    expect(
      await visible(world.users.tlA, [
        { role: 'RECRUITER', verticalId: world.verticals.v1 },
      ]),
    ).toEqual(keys('unassignedOpen'));
  });

  it('ASSIGNED + UNASSIGNED_OPEN: a recruiter reads assigned work of any status and OPEN vacancies nobody holds', async () => {
    expect(await as('recA')).toEqual(
      keys('assignedOpen', 'unassignedOpen', 'cancelled'),
    );
    expect(await as('recB')).toEqual(
      keys('unassignedOpen', 'recruiterInitiated'),
    );
    expect(await as('recC')).toEqual(keys('otherUnassigned', 'otherAssigned'));
    expect(await as('recD')).toEqual(keys('unassignedOpen', 'cancelled'));
  });

  it('UNASSIGNED_OPEN excludes ON_HOLD and DRAFT vacancies and ones that already have a recruiter', async () => {
    const shown = await as('recB');
    expect(shown).not.toContain('unassignedOnHold');
    expect(shown).not.toContain('draft');
    expect(shown).not.toContain('assignedOpen');
  });

  it('recruiter grants are bound to the role vertical', async () => {
    expect(
      await visible(world.users.recA, [
        { role: 'RECRUITER', verticalId: world.verticals.v2 },
      ]),
    ).toEqual(keys('otherUnassigned'));
  });

  it('mixed roles OR their grants and never widen a single scope', async () => {
    expect(
      await visible(world.users.tlA, [
        { role: 'TEAM_LEAD', verticalId: world.verticals.v1 },
        { role: 'RECRUITER', verticalId: world.verticals.v2 },
      ]),
    ).toEqual(
      keys('assignedOpen', 'unassignedOpen', 'cancelled', 'otherUnassigned'),
    );
  });

  it('Finance and users without roles read nothing', async () => {
    expect(await as('finance')).toEqual([]);
    expect(await as('nobody')).toEqual([]);
  });

  it('returns identities, position and participants with the visible rows', async () => {
    const scope = scopeFor(world.users.admin, world.roles.admin);
    const detail = await findVacancy(db, scope, world.v.cancelled);
    expect(detail).toMatchObject({
      status: 'CANCELLED',
      vertical: { id: world.verticals.v1 },
      position: { id: world.positions.p1, name: `Медіабаєр ${world.tag}` },
      teamLead: {
        id: world.users.tlA,
        fullName: 'Користувач tlA',
        isActive: true,
      },
      recruiterInitiated: false,
      headcount: 1,
      probationDays: 90,
      version: 1,
    });
    expect(detail!.recruiters.map((r) => r.id).sort()).toEqual(
      [world.users.recA, world.users.recD].sort(),
    );
    const initiated = await findVacancy(db, scope, world.v.recruiterInitiated);
    expect(initiated).toMatchObject({
      teamLead: null,
      recruiterInitiated: true,
    });
    expect(await findVacancy(db, scope, world.v.deleted)).toBeNull();
  });

  it('applies search and filters inside the scope', async () => {
    const scope = scopeFor(world.users.recA, world.roles.recA);
    const search = async (q: Record<string, unknown>) =>
      (
        await listVacancies(
          db,
          scope,
          vacancyListQuerySchema.parse({ limit: 100, ...q }),
        )
      ).items.map((i) => i.id);
    expect(await search({ status: 'CANCELLED' })).toEqual([world.v.cancelled]);
    expect(await search({ q: `Призначена Б ${world.tag}` })).toEqual([]);
    expect(await search({ q: `Призначена ${world.tag}` })).toEqual([
      world.v.assignedOpen,
    ]);
    const [outOfScope] =
      await admin`select public_no::text as no from app.vacancy where id = ${world.v.otherAssigned}`;
    expect(await search({ q: `V-${outOfScope!.no}` })).toEqual([]);
    const [inScope] =
      await admin`select public_no::text as no from app.vacancy where id = ${world.v.assignedOpen}`;
    expect(await search({ q: `v-${inScope!.no}` })).toEqual([
      world.v.assignedOpen,
    ]);
  });
});

describe('title search matches wildcards and backslashes literally [SEC-VAC-01]', () => {
  const titles = (suffix: string) => ({
    percent: `Знижка 100% ${suffix}`,
    plain: `Знижка 100 ${suffix}`,
    underscore: `Ключ a_b ${suffix}`,
    letter: `Ключ aXb ${suffix}`,
    backslash: `Шлях c:\\tmp ${suffix}`,
    slash: `Шлях c:/tmp ${suffix}`,
  });

  it('never lets %, _ or \\ in the query act as a pattern', async () => {
    const closed = {
      status: 'CANCELLED',
      closed_at: WORLD_OPENED_AT,
      cancelled_at: WORLD_OPENED_AT,
    };
    const added = titles(world.tag);
    const ids = Object.fromEntries(
      await Promise.all(
        Object.entries(added).map(
          async ([key, title]) =>
            [key, await world.addVacancy({ title, ...closed })] as const,
        ),
      ),
    ) as Record<keyof typeof added, string>;
    const scope = scopeFor(world.users.admin, world.roles.admin);
    const search = async (q: string) =>
      (
        await listVacancies(
          db,
          scope,
          vacancyListQuerySchema.parse({ limit: 100, q }),
        )
      ).items
        .map((item) => item.id)
        .sort();

    expect(await search(`100% ${world.tag}`)).toEqual([ids.percent]);
    expect(await search(`a_b ${world.tag}`)).toEqual([ids.underscore]);
    expect(await search(`c:\\tmp ${world.tag}`)).toEqual([ids.backslash]);
    expect(await search(`%${world.tag}`)).toEqual([]);
    expect(await search(`_${world.tag}`)).toEqual([]);
    expect(await search(`\\${world.tag}`)).toEqual([]);
    expect(await search(`Знижка 100 ${world.tag}`)).toEqual([ids.plain]);
    expect(await search(`Шлях c:/tmp ${world.tag}`)).toEqual([ids.slash]);
  });
});

/** Q-161: the salary range is vacancy content, visible to everyone who can see the vacancy; scope alone decides access (DG-10). */
describe('vacancy salary response snapshot by role [Q-161, DG-10, VIS-01..03]', () => {
  const SALARY = {
    salaryMinMinor: '250000',
    salaryMaxMinor: '400000',
    salaryCurrency: 'USD',
  } as const;
  const SALARY_KEYS = Object.keys(SALARY);

  const ctxFor = (userId: string, roles: Roles): RequestContext => ({
    requestId: randomUUID(),
    ip: null,
    userAgent: null,
    mutationId: null,
    identity: {
      authUserId: randomUUID(),
      sessionId: randomUUID(),
      aal: 'aal2',
    },
    auth: auth(userId, roles),
    db,
    clock: systemClock,
  });
  const named = (name: Name) => ctxFor(world.users[name], world.roles[name]);
  const headHr = () =>
    ctxFor(randomUUID(), [{ role: 'HEAD_HR', verticalId: world.verticals.v1 }]);

  beforeAll(async () => {
    await admin`update app.vacancy set salary_min_minor = ${SALARY.salaryMinMinor}, salary_max_minor = ${SALARY.salaryMaxMinor}, salary_currency = ${SALARY.salaryCurrency}
      where id in ${admin([world.v.assignedOpen, world.v.unassignedOpen, world.v.otherAssigned])}`;
  });

  it('detail exposes the salary range identically to every role that can see the vacancy', async () => {
    const baseline = await getVacancyDetail(
      named('admin'),
      world.v.assignedOpen,
    );
    expect(vacancyDetailSchema.safeParse(baseline).success).toBe(true);
    expect(baseline).toMatchObject(SALARY);

    const readers = {
      'head recruiter': named('head'),
      'head HR': headHr(),
      HR: named('hr'),
      'owning team lead': named('tlA'),
      'assigned recruiter': named('recA'),
    };
    for (const [label, ctx] of Object.entries(readers))
      expect(await getVacancyDetail(ctx, world.v.assignedOpen), label).toEqual(
        baseline,
      );
  });

  it('detail exposes the salary range to a recruiter who is not assigned to an OPEN unassigned vacancy', async () => {
    const baseline = await getVacancyDetail(
      named('admin'),
      world.v.unassignedOpen,
    );
    expect(baseline).toMatchObject(SALARY);
    expect(baseline.recruiters).toEqual([]);

    const readers = {
      'unassigned recruiter': named('recB'),
      'other unassigned recruiter': named('recD'),
      'head recruiter': named('head'),
      'head HR': headHr(),
      HR: named('hr'),
      'owning team lead': named('tlA'),
    };
    for (const [label, ctx] of Object.entries(readers))
      expect(
        await getVacancyDetail(ctx, world.v.unassignedOpen),
        label,
      ).toEqual(baseline);
  });

  it('out-of-scope roles get 404 and never receive the salary range', async () => {
    const denied: [string, RequestContext, string][] = [
      ['recruiter of another vertical', named('recC'), world.v.assignedOpen],
      ['team lead of another vertical', named('tlC'), world.v.assignedOpen],
      ['team lead of another vacancy', named('tlB'), world.v.assignedOpen],
      ['recruiter on an assigned vacancy', named('recB'), world.v.assignedOpen],
      ['Finance', named('finance'), world.v.assignedOpen],
      ['user without roles', named('nobody'), world.v.assignedOpen],
      [
        'head recruiter of another vertical',
        named('head'),
        world.v.otherAssigned,
      ],
      ['team lead of the first vertical', named('tlA'), world.v.otherAssigned],
    ];
    for (const [label, ctx, id] of denied)
      await expect(getVacancyDetail(ctx, id), label).rejects.toBeInstanceOf(
        NotFoundError,
      );

    for (const name of ['finance', 'nobody'] as const)
      await expect(
        listVacancyPage(named(name), { limit: 100 }),
        name,
      ).rejects.toBeInstanceOf(NotFoundError);
    const recC = await listVacancyPage(named('recC'), {
      vertical: world.verticals.v1,
      limit: 100,
    });
    expect(recC.items).toEqual([]);
  });

  it('the list DTO carries no salary field for any role; the range is a detail-only contract', async () => {
    const page = await listVacancyPage(named('admin'), {
      vertical: world.verticals.v1,
      limit: 100,
    });
    const salaried = page.items.filter((item) =>
      [world.v.assignedOpen, world.v.unassignedOpen].includes(item.id),
    );
    expect(salaried).toHaveLength(2);
    for (const item of page.items)
      for (const key of SALARY_KEYS) expect(item).not.toHaveProperty(key);

    const asRecruiter = await listVacancyPage(named('recB'), {
      vertical: world.verticals.v1,
      limit: 100,
    });
    expect(asRecruiter.items.length).toBeGreaterThan(0);
    for (const item of asRecruiter.items)
      for (const key of SALARY_KEYS) expect(item).not.toHaveProperty(key);
  });
});

describe('open vacancy work [ROLE-06, D24, D43, STORY-ROLE-06-1]', () => {
  const open = (name: Name, remaining?: Roles) =>
    userHasOpenVacancyWork(db, world.users[name], remaining);

  it('detects led and assigned OPEN/ON_HOLD work and ignores closed, deleted or draft work', async () => {
    expect(await open('tlA')).toBe(true);
    expect(await open('tlB')).toBe(true);
    expect(await open('recA')).toBe(true);
    expect(await open('recB')).toBe(true);
    expect(await open('recD')).toBe(false);
    expect(await open('admin')).toBe(false);
    expect(await open('nobody')).toBe(false);
  });

  it('does not treat a draft led by a Team Lead as open work [D98]', async () => {
    await admin`update app.vacancy set status = 'CANCELLED', closed_at = now(), cancelled_at = now() where id = ${world.v.unassignedOnHold}`;
    try {
      expect(await open('tlB')).toBe(false);
    } finally {
      await admin`update app.vacancy set status = 'ON_HOLD', closed_at = null, cancelled_at = null where id = ${world.v.unassignedOnHold}`;
    }
  });

  it('evaluates the proposed remaining roles per vertical and per responsibility', async () => {
    const v1 = world.verticals.v1;
    const v2 = world.verticals.v2;
    const role = (name: string, verticalId: string | null = v1) => ({
      role: name,
      verticalId,
    });
    expect(await open('tlA', [role('TEAM_LEAD')])).toBe(false);
    expect(await open('tlA', [role('TEAM_LEAD'), role('HR', v2)])).toBe(false);
    expect(await open('tlA', [role('TEAM_LEAD', v2)])).toBe(true);
    expect(await open('tlA', [role('RECRUITER')])).toBe(true);
    expect(await open('tlA', [])).toBe(true);
    expect(await open('recA', [role('RECRUITER')])).toBe(false);
    expect(await open('recA', [role('HEAD_RECRUITER')])).toBe(false);
    expect(
      await open('recA', [role('RECRUITER'), role('HEAD_RECRUITER')]),
    ).toBe(false);
    expect(await open('recA', [role('TEAM_LEAD')])).toBe(true);
    expect(await open('recA', [role('RECRUITER', v2)])).toBe(true);
    expect(await open('recA', [])).toBe(true);
    expect(await open('recD', [])).toBe(false);
  });
});
