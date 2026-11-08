import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { vacancyListQuerySchema } from '../../lib/schemas/vacancy';
import { buildAuthContext } from '../../server/authz/context';
import { scopeWhere } from '../../server/authz/scopes';
import type { UserId } from '../../server/authz/types';
import { vacancyScope } from '../../server/authz/vacancy-scope';
import * as schema from '../../server/db/schema';
import { findVacancy, listVacancies } from '../../server/repositories/vacancy';
import { userHasOpenVacancyWork } from '../../server/repositories/vacancy-work';
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
  scopeWhere(auth(userId, roles), 'vacancy.read', vacancyScope);

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

  it('VERTICAL: Head Recruiter and HR read their verticals only, including closed and draft rows', async () => {
    expect(await as('head')).toEqual(
      keys(
        'assignedOpen',
        'unassignedOpen',
        'unassignedOnHold',
        'recruiterInitiated',
        'draft',
        'cancelled',
      ),
    );
    expect(await as('hr')).toEqual(
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

  it('OWN: a Team Lead reads only vacancies currently led, in a vertical of the role', async () => {
    expect(await as('tlA')).toEqual(
      keys('assignedOpen', 'unassignedOpen', 'cancelled'),
    );
    expect(await as('tlB')).toEqual(keys('unassignedOnHold', 'draft'));
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
    const closed = { status: 'CANCELLED', closed_at: WORLD_OPENED_AT };
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

describe('open vacancy work [ROLE-06, D24, D43, STORY-ROLE-06-1]', () => {
  const open = (name: Name, remaining?: Roles) =>
    userHasOpenVacancyWork(db, world.users[name], remaining);

  it('detects led and assigned DRAFT/OPEN/ON_HOLD work and ignores closed or deleted work', async () => {
    expect(await open('tlA')).toBe(true);
    expect(await open('tlB')).toBe(true);
    expect(await open('recA')).toBe(true);
    expect(await open('recB')).toBe(true);
    expect(await open('recD')).toBe(false);
    expect(await open('admin')).toBe(false);
    expect(await open('nobody')).toBe(false);
  });

  it('treats a draft led by a Team Lead as open work', async () => {
    await admin`update app.vacancy set status = 'CANCELLED', closed_at = now() where id = ${world.v.unassignedOnHold}`;
    try {
      expect(await open('tlB')).toBe(true);
    } finally {
      await admin`update app.vacancy set status = 'ON_HOLD', closed_at = null where id = ${world.v.unassignedOnHold}`;
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
