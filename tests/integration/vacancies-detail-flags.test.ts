import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import type { VacancyDetail } from '../../lib/schemas/vacancy';
import { getVacancyDetail } from '../../server/services/vacancy';
import {
  createScenarioRunner,
  rolesOf,
  type Roles,
} from '../support/vacancy-write-harness';
import {
  createVacancyWorld,
  WORLD_OPENED_AT,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 4, prepare: false });
let world: VacancyWorld;
let scenario: ReturnType<typeof createScenarioRunner>;
let filled: string;
let noLead: string;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
  scenario = createScenarioRunner(client);
  filled = await world.addVacancy(
    {
      title: `Заповнена ${world.tag}`,
      status: 'FILLED',
      closed_at: WORLD_OPENED_AT,
    },
    [world.users.recA],
  );
  noLead = await world.addVacancy({
    title: `Без тімліда ${world.tag}`,
    team_lead_id: null,
    recruiter_initiated: true,
  });
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), client.end()]);
});

type Flags = Pick<
  VacancyDetail,
  'canSelfAssign' | 'canAssignRecruiters' | 'canSetTeamLead' | 'statusActions'
>;
const none: Flags = {
  canSelfAssign: false,
  canAssignRecruiters: false,
  canSetTeamLead: false,
  statusActions: [],
};

type Who = 'head' | 'admin' | 'hr' | 'recA' | 'tlA' | 'tlB';
const rolesFor = (who: Who) =>
  who === 'recA'
    ? rolesOf(world).recruiter
    : who === 'tlA' || who === 'tlB'
      ? rolesOf(world).teamLead
      : rolesOf(world)[who];
const userFor = (who: Who) =>
  who === 'recA'
    ? world.users.recA
    : who === 'tlA'
      ? world.users.tlA
      : who === 'tlB'
        ? world.users.tlB
        : undefined;

describe('Assignment and status flags on the detail [STORY-VAC-03-1, VAC-03-2, VAC-02-1, D130]', () => {
  it.each([
    [
      'head',
      'assignedOpen',
      {
        ...none,
        canAssignRecruiters: true,
        statusActions: ['HOLD', 'CANCEL'],
      },
    ],
    [
      'head',
      'unassignedOnHold',
      {
        ...none,
        canAssignRecruiters: true,
        statusActions: ['RESUME', 'CANCEL'],
      },
    ],
    [
      'admin',
      'otherUnassigned',
      {
        ...none,
        canAssignRecruiters: true,
        statusActions: ['HOLD', 'CANCEL'],
      },
    ],
    ['head', 'cancelled', none],
    ['hr', 'assignedOpen', none],
    ['recA', 'unassignedOpen', { ...none, canSelfAssign: true }],
    ['recA', 'assignedOpen', none],
    ['recA', 'cancelled', none],
    ['tlA', 'assignedOpen', { ...none, statusActions: ['HOLD', 'CANCEL'] }],
    [
      'tlB',
      'unassignedOnHold',
      { ...none, statusActions: ['RESUME', 'CANCEL'] },
    ],
  ] as const)('%s reads %s', async (who, key, expected) => {
    await scenario(async (s) => {
      const userId = userFor(who);
      const ctx = await s.as(rolesFor(who), userId ? { userId } : {});
      expect(await getVacancyDetail(ctx, world.v[key])).toMatchObject(expected);
    });
  });

  it('the author reading the own draft gets no controls', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).head, {
        userId: world.users.admin,
      });
      expect(await getVacancyDetail(ctx, world.v.draft)).toMatchObject({
        status: 'DRAFT',
        ...none,
      });
    });
  });

  it('a Head Recruiter may set the Team Lead only where none is set', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).head);
      expect(await getVacancyDetail(ctx, noLead)).toMatchObject({
        canSetTeamLead: true,
        canAssignRecruiters: true,
        statusActions: ['HOLD', 'CANCEL'],
      });
      expect(await getVacancyDetail(ctx, world.v.assignedOpen)).toMatchObject({
        canSetTeamLead: false,
      });
    });
  });

  it('FILLED offers only REOPEN to Admin and Head Recruiter, nothing to the Team Lead', async () => {
    await scenario(async (s) => {
      for (const who of ['head', 'admin'] as const) {
        const ctx = await s.as(rolesFor(who));
        expect(await getVacancyDetail(ctx, filled)).toMatchObject({
          statusActions: ['REOPEN'],
          canAssignRecruiters: false,
          canSetTeamLead: false,
        });
      }
      const lead = await s.as(rolesOf(world).teamLead, {
        userId: world.users.tlA,
      });
      expect(await getVacancyDetail(lead, filled)).toMatchObject({
        statusActions: [],
      });
    });
  });
});

describe('needsMfa on the detail [D63, STORY-VAC-02-1, VAC-03-2]', () => {
  const adminAnd = (extra: Roles) => [...rolesOf(world).admin, ...extra];

  it.each([
    ['Admin and Recruiter at aal1', 'recruiter', 'aal1', true],
    ['Admin and Recruiter at aal2', 'recruiter', 'aal2', false],
    ['Admin and Head Recruiter at aal1', 'head', 'aal1', false],
  ] as const)('%s: %s', async (_name, extra, aal, expected) => {
    await scenario(async (s) => {
      const ctx = await s.as(adminAnd(rolesOf(world)[extra]), {
        aal,
        userId: world.users.recA,
      });
      const detail = await getVacancyDetail(ctx, world.v.assignedOpen);
      expect(detail.needsMfa).toBe(expected);
    });
  });

  it('a Recruiter without the Admin role never gets it, and a closed vacancy has nothing to unlock', async () => {
    await scenario(async (s) => {
      const plain = await s.as(rolesOf(world).recruiter, {
        aal: 'aal1',
        userId: world.users.recA,
      });
      expect(
        (await getVacancyDetail(plain, world.v.assignedOpen)).needsMfa,
      ).toBe(false);
      const mixed = await s.as(adminAnd(rolesOf(world).recruiter), {
        aal: 'aal1',
        userId: world.users.recA,
      });
      expect((await getVacancyDetail(mixed, world.v.cancelled)).needsMfa).toBe(
        false,
      );
    });
  });
});

describe('Recruiter assignment rows [ADR-017 migration 0016]', () => {
  it('the runtime role may delete an assignment row, and nothing else changed for it', async () => {
    const id = await world.addVacancy({ title: `Видалення ${world.tag}` }, [
      world.users.recB,
    ]);
    const removed = await client`
      delete from app.vacancy_recruiter where vacancy_id = ${id} and user_id = ${world.users.recB} returning user_id`;
    expect(removed).toHaveLength(1);
    await expect(
      client`delete from app.vacancy where id = ${id}`,
    ).rejects.toMatchObject({ code: '42501' });
  });
});
