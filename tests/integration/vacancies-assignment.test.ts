import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { ZodError } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VACANCY_WRITE_RATE_LIMIT } from '../../lib/schemas/vacancy';
import { isEligibleRecruiterRow } from '../../server/repositories/recruiter-eligibility';
import { findAssignableRecruiters } from '../../server/repositories/vacancy-recruiter';
import * as schema from '../../server/db/schema';
import { getVacancyDetail } from '../../server/services/vacancy';
import {
  assignVacancyRecruiters,
  claimVacancy,
  listAssignableRecruiters,
  unassignVacancyRecruiter,
} from '../../server/services/vacancy-assignment';
import {
  addUser,
  createScenarioRunner,
  NOW,
  problem,
  rolesOf,
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
let extra: { filled: string; assignedOnHold: string };
const expectedSets = new Map<string, string[]>();

beforeAll(async () => {
  world = await createVacancyWorld(admin);
  scenario = createScenarioRunner(client);
  extra = {
    filled: await world.addVacancy({
      title: `Закрита ${world.tag}`,
      status: 'FILLED',
      closed_at: WORLD_OPENED_AT,
    }),
    assignedOnHold: await world.addVacancy(
      { title: `Призначена пауза ${world.tag}`, status: 'ON_HOLD' },
      [world.users.recA],
    ),
  };
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), client.end()]);
});

const roles = () => rolesOf(world);
type Scenario = Parameters<Parameters<typeof scenario>[0]>[0];
const v1 = () => world.verticals.v1;
const recruiterRole = () => [{ role: 'RECRUITER', verticalId: v1() }];

const claim = (ctx: Awaited<ReturnType<Scenario['as']>>, id: string) =>
  claimVacancy(ctx, id, {});
const assign = (
  ctx: Awaited<ReturnType<Scenario['as']>>,
  id: string,
  recruiterIds: string[],
  expectedVersion = 1,
) => assignVacancyRecruiters(ctx, id, { recruiterIds, expectedVersion });
const remove = (
  ctx: Awaited<ReturnType<Scenario['as']>>,
  id: string,
  userId: string,
  expectedVersion: number | string = 1,
) =>
  unassignVacancyRecruiter(ctx, id, userId, {
    expectedVersion: expectedVersion as number,
  });

const recruitersOf = async (s: Scenario, id: string) =>
  (
    await s.tx
      .select({
        userId: schema.vacancyRecruiter.userId,
        assignedBy: schema.vacancyRecruiter.assignedBy,
      })
      .from(schema.vacancyRecruiter)
      .where(eq(schema.vacancyRecruiter.vacancyId, id))
  ).sort((a, b) => a.userId.localeCompare(b.userId));
const versionOf = async (s: Scenario, id: string) =>
  (
    await s.tx
      .select({ version: schema.vacancy.version })
      .from(schema.vacancy)
      .where(eq(schema.vacancy.id, id))
  )[0]!.version;
const eventsOf = (s: Scenario, id: string) =>
  s.tx
    .select()
    .from(schema.entityEvent)
    .where(eq(schema.entityEvent.vacancyId, id));
const auditsOf = (s: Scenario, id: string) =>
  s.tx.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, id));

/** A refused call changes nothing: same set, same version, no event, no PII side row, no audit row. */
async function expectUntouched(s: Scenario, id: string, version = 1) {
  const before = expectedSets.get(id) ?? [];
  expect((await recruitersOf(s, id)).map((row) => row.userId)).toEqual(
    [...before].sort(),
  );
  expect(await versionOf(s, id)).toBe(version);
  const events = await eventsOf(s, id);
  expect(events).toEqual([]);
  expect(
    await s.tx
      .select()
      .from(schema.entityEventPii)
      .where(
        inArray(
          schema.entityEventPii.eventId,
          events.map((event) => event.id),
        ),
      ),
  ).toEqual([]);
  expect(await auditsOf(s, id)).toEqual([]);
}

/** The committed recruiter set of every world vacancy a denied call must leave as it found it. */
beforeAll(() => {
  const { users, v } = world;
  for (const [id, set] of [
    [v.unassignedOpen, []],
    [v.unassignedOnHold, []],
    [v.assignedOpen, [users.recA]],
    [v.cancelled, [users.recA, users.recD]],
    [extra.filled, []],
    [extra.assignedOnHold, [users.recA]],
    [v.draft, []],
    [v.otherUnassigned, []],
    [v.otherAssigned, [users.recC]],
    [v.deleted, [users.recD]],
  ] as const)
    expectedSets.set(id, [...set]);
});

describe('Claim: first recruiter wins [STORY-VAC-03-1, D130]', () => {
  it('a Recruiter takes an unassigned OPEN vacancy: row, version +1, one SELF event, one audit row, no PII', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      const ctx = await s.as(roles().recruiter);
      const detail = await claim(ctx, id);
      expect(detail).toMatchObject({
        id,
        version: 2,
        canSelfAssign: false,
        recruiters: [{ id: s.actorId }],
      });
      expect(await recruitersOf(s, id)).toEqual([
        { userId: s.actorId, assignedBy: s.actorId },
      ]);
      const events = await eventsOf(s, id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'vacancy.recruiter_assigned',
        actorId: s.actorId,
        occurredAt: NOW,
        verticalId: v1(),
        payload: { v: 1, userId: s.actorId, by: s.actorId, method: 'SELF' },
      });
      const audits = await auditsOf(s, id);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        action: 'vacancy.recruiter_assigned',
        actorId: s.actorId,
        before: { recruiterIds: [] },
        after: { recruiterIds: [s.actorId] },
      });
    });
  });

  it('the winner repeating the claim gets 200 and nothing more is written', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      const ctx = await s.as(roles().recruiter);
      await claim(ctx, id);
      expect(await claim(ctx, id)).toMatchObject({ version: 2 });
      expect(await eventsOf(s, id)).toHaveLength(1);
      expect(await auditsOf(s, id)).toHaveLength(1);
    });
  });

  it('after the claim the vacancy leaves the other Recruiter: detail 404, and a second claim is 404, never 409', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      await claim(await s.as(roles().recruiter), id);
      const otherId = await addUser(s.tx, { roles: recruiterRole() });
      const other = await s.as(roles().recruiter, { userId: otherId });
      expect(await problem(getVacancyDetail(other, id))).toMatchObject({
        status: 404,
      });
      expect(await problem(claim(other, id))).toMatchObject({ status: 404 });
      expect(await recruitersOf(s, id)).toHaveLength(1);
    });
  });

  it.each([
    ['head', 'head'],
    ['admin', 'admin'],
    ['hr', 'hr'],
    ['headHr', 'headHr'],
    ['teamLead', 'teamLead'],
  ] as const)(
    '%s has no self-assign grant: 403, nothing written',
    async (_n, who) => {
      await scenario(async (s) => {
        const id = world.v.unassignedOpen;
        const ctx = await s.as(roles()[who]);
        expect(await problem(claim(ctx, id))).toMatchObject({
          status: 403,
          code: 'FORBIDDEN',
        });
        await expectUntouched(s, id);
      });
    },
  );

  it('Finance has no vacancy read: 404; Admin without aal2: 401', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      expect(
        await problem(claim(await s.as(roles().finance), id)),
      ).toMatchObject({ status: 404 });
      expect(
        await problem(claim(await s.as(roles().admin, { aal: 'aal1' }), id)),
      ).toMatchObject({ status: 401 });
      await expectUntouched(s, id);
    });
  });

  it.each([
    ['another vertical', () => world.v.otherUnassigned],
    ['assigned to another recruiter', () => world.v.assignedOpen],
    ['unassigned but ON_HOLD', () => world.v.unassignedOnHold],
    ['FILLED', () => extra.filled],
    ['CANCELLED', () => world.v.cancelled],
    ['someone else draft', () => world.v.draft],
    ['soft-deleted', () => world.v.deleted],
    ['unknown id', () => randomUUID()],
    ['malformed id', () => 'not-a-uuid'],
  ])(
    'a Recruiter claiming a vacancy that is %s gets 404, never 409',
    async (_n, pick) => {
      await scenario(async (s) => {
        const id = pick();
        const ctx = await s.as(roles().recruiter);
        expect(await problem(claim(ctx, id))).toMatchObject({
          status: 404,
          code: 'NOT_FOUND',
        });
        if (expectedSets.has(id)) await expectUntouched(s, id, 1);
      });
    },
  );

  it('a Recruiter already on a vacancy claiming another one that is assigned gets 404', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().recruiter, { userId: world.users.recA });
      expect(
        await problem(claim(ctx, world.v.recruiterInitiated)),
      ).toMatchObject({ status: 404 });
    });
  });

  it('a Recruiter of one vertical who heads recruiting in another is 403 in the second', async () => {
    await scenario(async (s) => {
      const ctx = await s.as([
        { role: 'RECRUITER', verticalId: v1() },
        { role: 'HEAD_RECRUITER', verticalId: world.verticals.v2 },
      ]);
      expect(await problem(claim(ctx, world.v.otherUnassigned))).toMatchObject({
        status: 403,
      });
      await expectUntouched(s, world.v.otherUnassigned);
    });
  });

  it('a caller whose RECRUITER role was removed after the request context was built is 403', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      const ctx = s.asNew(roles().recruiter);
      expect(await problem(claim(ctx, id))).toMatchObject({ status: 403 });
      await expectUntouched(s, id);
    });
  });

  it('a deactivated caller is 403', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      const userId = await addUser(s.tx, {
        roles: recruiterRole(),
        active: false,
      });
      const ctx = s.asNew(roles().recruiter, { userId });
      expect(await problem(claim(ctx, id))).toMatchObject({ status: 403 });
      await expectUntouched(s, id);
    });
  });

  it('a body with any key is rejected before any write', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().recruiter);
      await expect(
        claimVacancy(ctx, world.v.unassignedOpen, { expectedVersion: 1 }),
      ).rejects.toBeInstanceOf(ZodError);
      await expectUntouched(s, world.v.unassignedOpen);
    });
  });

  it(`counts every call: the ${VACANCY_WRITE_RATE_LIMIT.perUser + 1}th inside a minute is 429`, async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      const ctx = await s.as(roles().recruiter);
      await claim(ctx, id);
      for (let n = 1; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        await claim(ctx, id);
      expect(await problem(claim(ctx, id))).toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
      });
    });
  });
});

describe('Assign recruiters [STORY-VAC-03-2, D130(1)]', () => {
  const newRecruiter = (s: Scenario, name = 'Рекрутер') =>
    addUser(s.tx, { roles: recruiterRole(), name });

  it.each(['head', 'admin'] as const)(
    '%s adds two recruiters: rows, one version bump, an event and an audit row per user',
    async (who) => {
      await scenario(async (s) => {
        const id = world.v.assignedOpen;
        const [a, b] = [await newRecruiter(s), await newRecruiter(s)];
        const ctx = await s.as(roles()[who]);
        const detail = await assign(ctx, id, [a, b]);
        expect(detail).toMatchObject({ version: 2, canAssignRecruiters: true });
        expect(detail.recruiters.map((r) => r.id).sort()).toEqual(
          [world.users.recA, a, b].sort(),
        );
        expect(
          (await recruitersOf(s, id)).filter(
            (r) => r.userId !== world.users.recA,
          ),
        ).toEqual(
          [a, b].sort().map((userId) => ({ userId, assignedBy: s.actorId })),
        );
        const events = await eventsOf(s, id);
        expect(events).toHaveLength(2);
        for (const event of events)
          expect(event).toMatchObject({
            type: 'vacancy.recruiter_assigned',
            verticalId: v1(),
            payload: { v: 1, by: s.actorId, method: 'MANAGER' },
          });
        const audits = await auditsOf(s, id);
        expect(audits).toHaveLength(2);
        expect(audits.map((row) => row.after)).toEqual(
          expect.arrayContaining([
            { recruiterIds: [world.users.recA, a] },
            { recruiterIds: [world.users.recA, a, b] },
          ]),
        );
      });
    },
  );

  it('works on an ON_HOLD vacancy', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOnHold;
      const a = await newRecruiter(s);
      expect(await assign(await s.as(roles().head), id, [a])).toMatchObject({
        version: 2,
        status: 'ON_HOLD',
      });
    });
  });

  it('skips ids already assigned; a request that adds nobody writes nothing', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(roles().head);
      expect(await assign(ctx, id, [world.users.recA])).toMatchObject({
        version: 1,
      });
      await expectUntouched(s, id);
      const a = await newRecruiter(s);
      await assign(ctx, id, [world.users.recA, a]);
      expect(await eventsOf(s, id)).toHaveLength(1);
      expect(await versionOf(s, id)).toBe(2);
    });
  });

  it('a vacancy lists the removed-from-pool state: assigning to an unassigned one hides it from other Recruiters', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      const [a] = [await newRecruiter(s)];
      const bystander = await newRecruiter(s);
      await assign(await s.as(roles().head), id, [a]);
      const other = await s.as(roles().recruiter, { userId: bystander });
      expect(await problem(getVacancyDetail(other, id))).toMatchObject({
        status: 404,
      });
      const assignee = await s.as(roles().recruiter, { userId: a });
      expect(await getVacancyDetail(assignee, id)).toMatchObject({ id });
    });
  });

  it('a stale version is 409 STALE_STATE and the set is unchanged', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const a = await newRecruiter(s);
      expect(
        await problem(assign(await s.as(roles().head), id, [a], 7)),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
      await expectUntouched(s, id);
    });
  });

  it.each([
    ['FILLED', () => extra.filled],
    ['CANCELLED', () => world.v.cancelled],
  ])(
    'a %s vacancy is 409 VACANCY_CLOSED, also with a stale version',
    async (_n, pick) => {
      await scenario(async (s) => {
        const id = pick();
        const a = await newRecruiter(s);
        const ctx = await s.as(roles().head);
        for (const version of [1, 9])
          expect(await problem(assign(ctx, id, [a], version))).toMatchObject({
            status: 409,
            code: 'VACANCY_CLOSED',
          });
        await expectUntouched(s, id);
      });
    },
  );

  it('the author draft is 409 VACANCY_CLOSED and writes no audit row (D92)', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().admin);
      const draftId = randomUUID();
      await s.tx.insert(schema.vacancy).values({
        id: draftId,
        verticalId: v1(),
        positionId: world.positions.p1,
        title: `Моя чернетка ${world.tag}`,
        recruiterInitiated: true,
        status: 'DRAFT',
        createdBy: s.actorId,
      });
      const a = await newRecruiter(s);
      expect(await problem(assign(ctx, draftId, [a]))).toMatchObject({
        status: 409,
        code: 'VACANCY_CLOSED',
      });
      expect(await auditsOf(s, draftId)).toEqual([]);
      expect(await recruitersOf(s, draftId)).toEqual([]);
    });
  });

  describe('ineligible assignees: one identical 400, nothing written', () => {
    const cases: [string, (s: Scenario) => Promise<string>][] = [
      [
        'inactive',
        (s) => addUser(s.tx, { roles: recruiterRole(), active: false }),
      ],
      [
        'invite not accepted',
        (s) => addUser(s.tx, { roles: recruiterRole(), invited: true }),
      ],
      [
        'recruiter of another vertical',
        (s) =>
          addUser(s.tx, {
            roles: [{ role: 'RECRUITER', verticalId: world.verticals.v2 }],
          }),
      ],
      [
        'Head Recruiter without the RECRUITER role',
        (s) =>
          addUser(s.tx, {
            roles: [{ role: 'HEAD_RECRUITER', verticalId: v1() }],
          }),
      ],
      ['Team Lead', (s) => addUser(s.tx, { roles: roles().teamLead })],
      ['no role at all', (s) => addUser(s.tx)],
      ['unknown user', () => Promise.resolve(randomUUID())],
    ];
    it.each(cases)('%s', async (_n, make) => {
      await scenario(async (s) => {
        const id = world.v.assignedOpen;
        const bad = await make(s);
        const good = await newRecruiter(s);
        const refusal = await problem(
          assign(await s.as(roles().head), id, [good, bad]),
        );
        expect(refusal).toEqual({
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ path: 'body.recruiterIds', code: 'invalid_recruiter' }],
        });
        await expectUntouched(s, id);
      });
    });
  });

  describe('denied callers: no write, event or audit row', () => {
    it.each([
      ['unassigned Recruiter', 'recruiter', 403],
      ['hr', 'hr', 403],
      ['headHr', 'headHr', 403],
      ['teamLead', 'teamLead', 403],
      ['Head Recruiter of another vertical', 'headOther', 404],
      ['Finance', 'finance', 404],
    ] as const)('%s is %i', async (_n, who, status) => {
      await scenario(async (s) => {
        const id = world.v.assignedOpen;
        const a = await newRecruiter(s);
        const refusal = await problem(
          assign(await s.as(roles()[who]), id, [a]),
        );
        expect(refusal.status).toBe(status);
        await expectUntouched(s, id);
      });
    });

    it('a Recruiter assigned to the vacancy is 403 as well', async () => {
      await scenario(async (s) => {
        const id = world.v.assignedOpen;
        const a = await newRecruiter(s);
        const ctx = await s.as(roles().recruiter, { userId: world.users.recA });
        expect(await problem(assign(ctx, id, [a]))).toMatchObject({
          status: 403,
        });
        await expectUntouched(s, id);
      });
    });

    it('Admin on someone else draft and on a deleted vacancy gets 404', async () => {
      await scenario(async (s) => {
        const a = await newRecruiter(s);
        const ctx = await s.as(roles().admin);
        for (const id of [world.v.draft, world.v.deleted, randomUUID()])
          expect(await problem(assign(ctx, id, [a]))).toMatchObject({
            status: 404,
          });
        await expectUntouched(s, world.v.draft);
      });
    });

    it('Admin without aal2 is 401', async () => {
      await scenario(async (s) => {
        const a = await newRecruiter(s);
        const ctx = await s.as(roles().admin, { aal: 'aal1' });
        expect(
          await problem(assign(ctx, world.v.assignedOpen, [a])),
        ).toMatchObject({ status: 401 });
        await expectUntouched(s, world.v.assignedOpen);
      });
    });
  });

  it.each([
    [
      'extra key',
      (id: string) => ({ recruiterIds: [id], expectedVersion: 1, x: 1 }),
    ],
    ['empty list', () => ({ recruiterIds: [], expectedVersion: 1 })],
    [
      '21 ids',
      () => ({
        recruiterIds: Array.from({ length: 21 }, () => randomUUID()),
        expectedVersion: 1,
      }),
    ],
    [
      'duplicate ids differing in case',
      (id: string) => ({
        recruiterIds: [id, id.toUpperCase()],
        expectedVersion: 1,
      }),
    ],
    ['non-uuid', () => ({ recruiterIds: ['nope'], expectedVersion: 1 })],
    [
      'not an array',
      (id: string) => ({ recruiterIds: id, expectedVersion: 1 }),
    ],
    ['missing version', (id: string) => ({ recruiterIds: [id] })],
    [
      'version as string',
      (id: string) => ({ recruiterIds: [id], expectedVersion: '1' }),
    ],
    ['version 0', (id: string) => ({ recruiterIds: [id], expectedVersion: 0 })],
    [
      'fractional version',
      (id: string) => ({ recruiterIds: [id], expectedVersion: 1.5 }),
    ],
  ])('body with %s is rejected before any write', async (_n, body) => {
    await scenario(async (s) => {
      const a = await newRecruiter(s);
      await expect(
        assignVacancyRecruiters(
          await s.as(roles().head),
          world.v.assignedOpen,
          body(a) as never,
        ),
      ).rejects.toBeInstanceOf(ZodError);
      await expectUntouched(s, world.v.assignedOpen);
    });
  });

  it(`counts every call: the ${VACANCY_WRITE_RATE_LIMIT.perUser + 1}th inside a minute is 429`, async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(roles().head);
      for (let n = 0; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        await assign(ctx, id, [world.users.recA]);
      expect(await problem(assign(ctx, id, [world.users.recA]))).toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
      });
    });
  });
});

describe('Remove a recruiter [STORY-VAC-03-2, D130(2), D130(5)]', () => {
  it.each(['head', 'admin'] as const)(
    '%s removes the only recruiter of an OPEN vacancy: row gone, version +1, event and audit with ids only',
    async (who) => {
      await scenario(async (s) => {
        const id = world.v.assignedOpen;
        const ctx = await s.as(roles()[who]);
        const detail = await remove(ctx, id, world.users.recA);
        expect(detail).toMatchObject({ version: 2, recruiters: [] });
        expect(await recruitersOf(s, id)).toEqual([]);
        const events = await eventsOf(s, id);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'vacancy.recruiter_unassigned',
          verticalId: v1(),
          payload: { v: 1, userId: world.users.recA, by: s.actorId },
        });
        const audits = await auditsOf(s, id);
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
          action: 'vacancy.recruiter_unassigned',
          before: { recruiterIds: [world.users.recA] },
          after: { recruiterIds: [] },
        });
      });
    },
  );

  it('the last removal on an OPEN vacancy returns it to the pool, where Recruiters of the vertical read and may claim it', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      await remove(await s.as(roles().head), id, world.users.recA);
      const otherId = await addUser(s.tx, { roles: recruiterRole() });
      const other = await s.as(roles().recruiter, { userId: otherId });
      expect(await getVacancyDetail(other, id)).toMatchObject({
        id,
        canSelfAssign: true,
      });
      expect(await claim(other, id)).toMatchObject({
        recruiters: [{ id: otherId }],
      });
    });
  });

  it('a removed recruiter loses access in the same commit when colleagues remain: detail 404', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const colleague = await addUser(s.tx, { roles: recruiterRole() });
      const head = await s.as(roles().head);
      await assign(head, id, [colleague]);
      await remove(head, id, world.users.recA, 2);
      const removed = await s.as(roles().recruiter, {
        userId: world.users.recA,
      });
      expect(await problem(getVacancyDetail(removed, id))).toMatchObject({
        status: 404,
      });
    });
  });

  it('removal on an ON_HOLD vacancy hides it from every Recruiter until resume (D130-5)', async () => {
    await scenario(async (s) => {
      const id = extra.assignedOnHold;
      await remove(await s.as(roles().head), id, world.users.recA);
      const otherId = await addUser(s.tx, { roles: recruiterRole() });
      for (const userId of [otherId, world.users.recA])
        expect(
          await problem(
            getVacancyDetail(await s.as(roles().recruiter, { userId }), id),
          ),
        ).toMatchObject({ status: 404 });
    });
  });

  it.each([
    ['an existing user outside the set', async (s: Scenario) => s.actorId],
    [
      'a recruiter of another vertical',
      async (s: Scenario) =>
        addUser(s.tx, {
          roles: [{ role: 'RECRUITER', verticalId: world.verticals.v2 }],
        }),
    ],
    ['a random uuid', async () => randomUUID()],
    ['an upper-case random uuid', async () => randomUUID().toUpperCase()],
  ])('removing %s is the same 200 no-op', async (_n, pick) => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const target = await pick(s);
      const detail = await remove(await s.as(roles().head), id, target);
      expect(detail).toMatchObject({ version: 1 });
      await expectUntouched(s, id);
    });
  });

  it('a Recruiter cannot remove self or a colleague: 403, rows stay', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const colleague = await addUser(s.tx, { roles: recruiterRole() });
      const ctx = await s.as(roles().recruiter, { userId: world.users.recA });
      for (const target of [world.users.recA, colleague])
        expect(await problem(remove(ctx, id, target))).toMatchObject({
          status: 403,
        });
      await expectUntouched(s, id);
    });
  });

  it.each([
    ['hr', 'hr', 403],
    ['teamLead', 'teamLead', 403],
    ['Head Recruiter of another vertical', 'headOther', 404],
  ] as const)('%s is %i', async (_n, who, status) => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const refusal = await problem(
        remove(await s.as(roles()[who]), id, world.users.recA),
      );
      expect(refusal.status).toBe(status);
      await expectUntouched(s, id);
    });
  });

  it('a stale version is 409 STALE_STATE; a closed vacancy is 409 VACANCY_CLOSED even when stale', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head);
      expect(
        await problem(remove(ctx, world.v.assignedOpen, world.users.recA, 5)),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
      expect(
        await problem(remove(ctx, world.v.cancelled, world.users.recA, 5)),
      ).toMatchObject({ status: 409, code: 'VACANCY_CLOSED' });
      await expectUntouched(s, world.v.assignedOpen);
      await expectUntouched(s, world.v.cancelled);
    });
  });

  it.each([
    ['empty', ''],
    ['text', 'abc'],
    ['fractional', 1.5],
    ['zero', 0],
    ['array', ['1', '2']],
  ])('expectedVersion %s is rejected before any write', async (_n, value) => {
    await scenario(async (s) => {
      await expect(
        remove(
          await s.as(roles().head),
          world.v.assignedOpen,
          world.users.recA,
          value as never,
        ),
      ).rejects.toBeInstanceOf(ZodError);
      await expectUntouched(s, world.v.assignedOpen);
    });
  });

  it('a malformed user id is 404', async () => {
    await scenario(async (s) => {
      expect(
        await problem(
          remove(await s.as(roles().head), world.v.assignedOpen, 'nope'),
        ),
      ).toMatchObject({ status: 404 });
    });
  });
});

describe('Assignable recruiters [STORY-VAC-03-2, D79]', () => {
  it('lists exactly the eligible recruiters of the vertical plus the assigned; keys are id, fullName, assigned, active', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const eligible = await addUser(s.tx, {
        roles: recruiterRole(),
        name: 'Ярема Придатний',
      });
      const inactive = await addUser(s.tx, {
        roles: recruiterRole(),
        active: false,
      });
      const invited = await addUser(s.tx, {
        roles: recruiterRole(),
        invited: true,
      });
      const foreign = await addUser(s.tx, {
        roles: [{ role: 'RECRUITER', verticalId: world.verticals.v2 }],
      });
      const headOnly = await addUser(s.tx, {
        roles: [{ role: 'HEAD_RECRUITER', verticalId: v1() }],
      });
      await s.tx
        .insert(schema.userRole)
        .values({
          userId: world.users.recA,
          role: 'RECRUITER',
          verticalId: v1(),
        });
      await s.tx
        .update(schema.appUser)
        .set({ isActive: false, deactivatedAt: NOW })
        .where(eq(schema.appUser.id, world.users.recA));
      const { items } = await listAssignableRecruiters(
        await s.as(roles().head),
        id,
      );
      const byId = new Map(items.map((item) => [item.id, item]));
      expect(byId.get(eligible)).toEqual({
        id: eligible,
        fullName: 'Ярема Придатний',
        assigned: false,
        active: true,
      });
      expect(byId.get(world.users.recA)).toMatchObject({
        assigned: true,
        active: false,
      });
      for (const excluded of [inactive, invited, foreign, headOnly])
        expect(byId.has(excluded)).toBe(false);
      for (const item of items)
        expect(Object.keys(item).sort()).toEqual([
          'active',
          'assigned',
          'fullName',
          'id',
        ]);
    });
  });

  it('the picker SQL and the row predicate agree for every kind of user', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      const kinds = {
        recruiter: { roles: recruiterRole() },
        inactive: { roles: recruiterRole(), active: false },
        invited: { roles: recruiterRole(), invited: true },
        otherVertical: {
          roles: [{ role: 'RECRUITER', verticalId: world.verticals.v2 }],
        },
        head: { roles: [{ role: 'HEAD_RECRUITER', verticalId: v1() }] },
        teamLead: { roles: [{ role: 'TEAM_LEAD', verticalId: v1() }] },
      };
      const created = new Map<string, keyof typeof kinds>();
      for (const [kind, options] of Object.entries(kinds))
        created.set(await addUser(s.tx, options), kind as keyof typeof kinds);
      const rows = await s.tx
        .select({
          user: schema.appUser,
          role: schema.userRole,
        })
        .from(schema.appUser)
        .innerJoin(
          schema.userRole,
          eq(schema.userRole.userId, schema.appUser.id),
        )
        .where(
          and(
            inArray(schema.appUser.id, [...created.keys()]),
            eq(schema.userRole.verticalId, v1()),
          ),
        );
      const byPredicate = rows
        .filter(({ user, role }) => isEligibleRecruiterRow(user, role))
        .map(({ user }) => created.get(user.id));
      const bySql = (await findAssignableRecruiters(s.tx, id, v1()))
        .filter((item) => created.has(item.id))
        .map((item) => created.get(item.id));
      expect(bySql).toEqual(byPredicate);
      expect(bySql).toEqual(['recruiter']);
    });
  });

  it.each([
    ['unassigned Recruiter', 'recruiter', 403],
    ['hr', 'hr', 403],
    ['headHr', 'headHr', 403],
    ['teamLead', 'teamLead', 403],
    ['Head Recruiter of another vertical', 'headOther', 404],
    ['Finance', 'finance', 404],
  ] as const)('%s is %i', async (_n, who, status) => {
    await scenario(async (s) => {
      const refusal = await problem(
        listAssignableRecruiters(
          await s.as(roles()[who]),
          world.v.assignedOpen,
        ),
      );
      expect(refusal.status).toBe(status);
    });
  });

  it('someone else draft, a deleted vacancy, an unknown and a malformed id are 404', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().admin);
      for (const id of [world.v.draft, world.v.deleted, randomUUID(), 'nope'])
        expect(await problem(listAssignableRecruiters(ctx, id))).toMatchObject({
          status: 404,
        });
    });
  });

  it('a closed vacancy is 409 VACANCY_CLOSED, data free', async () => {
    await scenario(async (s) => {
      expect(
        await problem(
          listAssignableRecruiters(await s.as(roles().head), extra.filled),
        ),
      ).toEqual({ status: 409, code: 'VACANCY_CLOSED' });
    });
  });
});
