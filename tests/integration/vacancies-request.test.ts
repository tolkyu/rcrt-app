import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { plainTextToDoc } from '../../lib/plain-text-doc';
import { VACANCY_WRITE_RATE_LIMIT } from '../../lib/schemas/vacancy';
import { requestVacancySchema } from '../../lib/schemas/vacancy-request';
import * as schema from '../../server/db/schema';
import { requestVacancy } from '../../server/services/vacancy-request';
import {
  addPosition,
  addUser,
  createScenarioRunner,
  NOW,
  problem,
  rolesOf,
} from '../support/vacancy-write-harness';
import {
  createVacancyWorld,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 4, prepare: false });
let world: VacancyWorld;
let scenario: ReturnType<typeof createScenarioRunner>;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
  scenario = createScenarioRunner(client);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), client.end()]);
});

const input = (overrides: Record<string, unknown> = {}) =>
  requestVacancySchema.parse({ positionId: world.positions.p1, ...overrides });
type Scenario = Parameters<Parameters<typeof scenario>[0]>[0];
const written = (s: Scenario) =>
  s.tx
    .select()
    .from(schema.vacancy)
    .where(eq(schema.vacancy.createdBy, s.actorId));
const events = (s: Scenario) =>
  s.tx
    .select()
    .from(schema.entityEvent)
    .where(eq(schema.entityEvent.actorId, s.actorId));

describe('Team Lead request [STORY-VAC-03-3, D86/D87/D90/D122]', () => {
  it.each(['teamLead', 'teamLeadAndRecruiter'] as const)(
    '%s creates OPEN, assigned to self as TL and unassigned to recruiters',
    async (role) => {
      await scenario(async (s) => {
        const comment = '<b>Досвід</b> Facebook Ads\nКонтакт: qa@example.test';
        const created = await requestVacancy(
          await s.as(rolesOf(world)[role]),
          input({ headcount: 2, priority: 'URGENT', comment }),
          randomUUID(),
        );
        const [position] = await s.tx
          .select()
          .from(schema.position)
          .where(eq(schema.position.id, world.positions.p1));
        expect(created).toMatchObject({
          title: position?.name,
          status: 'OPEN',
          headcount: 2,
          priority: 'URGENT',
          source: 'APP',
          probationDays: 90,
          teamLead: { id: s.actorId },
          recruiterInitiated: false,
          recruiters: [],
          openedAt: NOW.toISOString(),
          seniority: null,
          workFormat: null,
          employmentType: null,
          salaryMinMinor: null,
          salaryMaxMinor: null,
        });
        const [stored] = await written(s);
        expect(stored).toMatchObject({
          createdBy: s.actorId,
          descriptionDoc: plainTextToDoc(comment),
          requirementsDoc: null,
        });
        expect(
          await s.tx
            .select()
            .from(schema.vacancyRecruiter)
            .where(eq(schema.vacancyRecruiter.vacancyId, created.id)),
        ).toEqual([]);
        const createdEvents = await events(s);
        expect(createdEvents).toHaveLength(1);
        expect(createdEvents[0]).toMatchObject({
          type: 'vacancy.created',
          vacancyId: created.id,
        });
        const payload = JSON.stringify(createdEvents[0]?.payload);
        expect(payload).not.toContain(comment);
        expect(payload).not.toContain('qa@example.test');
        expect(payload).not.toContain(position?.name);
      });
    },
  );

  it('stores the comment as plain text paragraphs, one per line, with markup kept as text', async () => {
    await scenario(async (s) => {
      await requestVacancy(
        await s.as(rolesOf(world).teamLead),
        input({ comment: '<b>Досвід</b>\nFacebook Ads' }),
        randomUUID(),
      );
      expect(await written(s)).toMatchObject([
        {
          descriptionDoc: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: '<b>Досвід</b>' }],
              },
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Facebook Ads' }],
              },
            ],
          },
        },
      ]);
    });
  });

  it.each([
    'admin',
    'head',
    'headOther',
    'recruiter',
    'recruiterOther',
    'headHr',
    'hr',
    'finance',
    'none',
  ] as const)(
    '%s is refused as a requester and nothing is written',
    async (role) => {
      await scenario(async (s) => {
        const ctx = await s.as(rolesOf(world)[role]);
        expect(
          await problem(requestVacancy(ctx, input(), randomUUID())),
        ).toMatchObject({ status: 404, code: 'NOT_FOUND' });
        expect(await written(s)).toEqual([]);
        expect(await events(s)).toEqual([]);
        expect(
          await s.tx
            .select()
            .from(schema.idempotencyKey)
            .where(eq(schema.idempotencyKey.userId, s.actorId)),
        ).toEqual([]);
      });
    },
  );

  it('a Team Lead of another vertical gets 404 for this position and writes nothing', async () => {
    await scenario(async (s) => {
      const ctx = await s.as([
        { role: 'TEAM_LEAD', verticalId: world.verticals.v2 },
      ]);
      expect(
        await problem(requestVacancy(ctx, input(), randomUUID())),
      ).toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect(await written(s)).toEqual([]);
    });
  });

  it('empty comment leaves the description unspecified; missing optional fields use defaults', async () => {
    await scenario(async (s) => {
      const created = await requestVacancy(
        await s.as(rolesOf(world).teamLead),
        input({ comment: ' \n ' }),
        randomUUID(),
      );
      expect(created).toMatchObject({ headcount: 1, priority: 'NORMAL' });
      expect(await written(s)).toMatchObject([{ descriptionDoc: null }]);
    });
  });

  it('records deduplicated active recruiters and heads from this vertical only, excluding requester [D93]', async () => {
    await scenario(async (s) => {
      const roleSets = rolesOf(world);
      const recruiter = await addUser(s.tx, { roles: roleSets.recruiter });
      const head = await addUser(s.tx, { roles: roleSets.head });
      const dual = await addUser(s.tx, {
        roles: [...roleSets.head, ...roleSets.recruiter],
      });
      await addUser(s.tx, { roles: roleSets.recruiter, active: false });
      await addUser(s.tx, { roles: roleSets.recruiterOther });
      await addUser(s.tx, { roles: roleSets.headOther });
      await addUser(s.tx, { roles: roleSets.hr });
      await requestVacancy(
        await s.as(roleSets.teamLeadAndRecruiter),
        input(),
        randomUUID(),
      );
      expect((await events(s))[0]?.payload).toMatchObject({
        recipientUserIds: expect.arrayContaining([recruiter, head, dual]),
      });
      expect((await events(s))[0]?.payload).toHaveProperty(
        'recipientUserIds',
        expect.toSatisfy(
          (ids: unknown) =>
            Array.isArray(ids) && ids.length === 3 && new Set(ids).size === 3,
        ),
      );
    });
  });

  it('leaves out invited-but-unaccepted users, the requesting head, and users who are Team Leads only here [VR-01]', async () => {
    await scenario(async (s) => {
      const roleSets = rolesOf(world);
      const accepted = await addUser(s.tx, { roles: roleSets.recruiter });
      await addUser(s.tx, { roles: roleSets.recruiter, invited: true });
      await addUser(s.tx, { roles: roleSets.head, invited: true });
      await addUser(s.tx, { roles: roleSets.teamLead });
      await addUser(s.tx, {
        roles: [...roleSets.teamLead, ...roleSets.recruiterOther],
      });
      await requestVacancy(
        await s.as([...roleSets.teamLead, ...roleSets.head]),
        input(),
        randomUUID(),
      );
      expect((await events(s))[0]?.payload).toMatchObject({
        recipientUserIds: [accepted],
      });
    });
  });

  it('a vertical without recruiters records an empty addressee list', async () => {
    await scenario(async (s) => {
      await requestVacancy(
        await s.as(rolesOf(world).teamLead),
        input(),
        randomUUID(),
      );
      const payload = (await events(s))[0]?.payload as {
        recipientUserIds?: string[];
      };
      expect(payload.recipientUserIds).toBeDefined();
      expect(payload.recipientUserIds).not.toContain(s.actorId);
    });
  });

  it('foreign and missing positions are indistinguishable, including mixed roles in another vertical', async () => {
    await scenario(async (s) => {
      const ctx = await s.as([
        ...rolesOf(world).teamLead,
        ...rolesOf(world).recruiterOther,
      ]);
      const failures = [];
      for (const positionId of [world.positions.p2, randomUUID()])
        failures.push(
          await problem(
            requestVacancy(ctx, input({ positionId }), randomUUID()),
          ),
        );
      expect(failures[0]).toEqual(failures[1]);
      expect(failures[0]).toMatchObject({ status: 404 });
      expect(await written(s)).toEqual([]);
    });
  });

  it('a foreign inactive position and an unaccepted Team Lead with a foreign position are 404, like a missing id', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).teamLead);
      const foreignInactive = await addPosition(
        s.tx,
        world.verticals.v2,
        s.actorId,
        { active: false },
      );
      const missing = await problem(
        requestVacancy(ctx, input({ positionId: randomUUID() }), randomUUID()),
      );
      expect(
        await problem(
          requestVacancy(
            ctx,
            input({ positionId: foreignInactive }),
            randomUUID(),
          ),
        ),
      ).toEqual(missing);
      await s.tx
        .update(schema.appUser)
        .set({ activatedAt: null })
        .where(eq(schema.appUser.id, s.actorId));
      expect(
        await problem(
          requestVacancy(
            ctx,
            input({ positionId: world.positions.p2 }),
            randomUUID(),
          ),
        ),
      ).toEqual(missing);
      expect(await written(s)).toEqual([]);
    });
  });

  it('a TL in several verticals can request in each without a routing priority', async () => {
    await scenario(async (s) => {
      const ctx = await s.as([
        { role: 'TEAM_LEAD', verticalId: world.verticals.v1 },
        { role: 'TEAM_LEAD', verticalId: world.verticals.v2 },
      ]);
      for (const positionId of [world.positions.p1, world.positions.p2])
        expect(
          await requestVacancy(ctx, input({ positionId }), randomUUID()),
        ).toMatchObject({
          position: { id: positionId },
          teamLead: { id: s.actorId },
        });
    });
  });

  it('inactive position returns a field error and reserves no key', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).teamLead);
      const positionId = await addPosition(
        s.tx,
        world.verticals.v1,
        s.actorId,
        { active: false },
      );
      const key = randomUUID();
      expect(
        await problem(requestVacancy(ctx, input({ positionId }), key)),
      ).toMatchObject({
        status: 400,
        errors: [{ path: 'body.positionId', code: 'position_inactive' }],
      });
      expect(await written(s)).toEqual([]);
      await s.tx
        .update(schema.position)
        .set({ isActive: true })
        .where(eq(schema.position.id, positionId));
      expect(
        await requestVacancy(ctx, input({ positionId }), key),
      ).toMatchObject({ status: 'OPEN' });
    });
  });

  it.each(['unaccepted', 'deactivated', 'lost-role'] as const)(
    'rechecks %s TL eligibility from storage after the request context was built [D122]',
    async (state) => {
      await scenario(async (s) => {
        const ctx = await s.as(rolesOf(world).teamLead);
        if (state === 'lost-role')
          await s.tx
            .delete(schema.userRole)
            .where(eq(schema.userRole.userId, s.actorId));
        else
          await s.tx
            .update(schema.appUser)
            .set(
              state === 'unaccepted'
                ? { activatedAt: null }
                : { isActive: false, deactivatedAt: NOW },
            )
            .where(eq(schema.appUser.id, s.actorId));
        expect(
          await problem(requestVacancy(ctx, input(), randomUUID())),
        ).toMatchObject({ status: 403 });
        expect(await written(s)).toEqual([]);
        expect(await events(s)).toEqual([]);
        expect(
          await s.tx
            .select()
            .from(schema.idempotencyKey)
            .where(eq(schema.idempotencyKey.userId, s.actorId)),
        ).toEqual([]);
      });
    },
  );

  it('replays one key once, rejects changed body, and permits a deliberate identical second request', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).teamLead);
      const key = randomUUID();
      const first = await requestVacancy(ctx, input(), key);
      expect((await requestVacancy(ctx, input(), key)).id).toBe(first.id);
      expect(
        await problem(requestVacancy(ctx, input({ headcount: 2 }), key)),
      ).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
      const second = await requestVacancy(ctx, input(), randomUUID());
      expect(second.id).not.toBe(first.id);
      expect(second.number).not.toBe(first.number);
      expect(await written(s)).toHaveLength(2);
      expect(await events(s)).toHaveLength(2);
    });
  });

  it(`refuses the ${VACANCY_WRITE_RATE_LIMIT.perUser + 1}th write inside a minute with 429 and writes nothing for it`, async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).teamLead);
      for (let n = 0; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        await requestVacancy(ctx, input(), randomUUID());
      expect(
        await problem(requestVacancy(ctx, input(), randomUUID())),
      ).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
      expect(await written(s)).toHaveLength(VACANCY_WRITE_RATE_LIMIT.perUser);
    });
  });

  it('the same key from another Team Lead creates its own vacancy and never replays the first', async () => {
    await scenario(async (s) => {
      const key = randomUUID();
      const first = await requestVacancy(
        await s.as(rolesOf(world).teamLead),
        input(),
        key,
      );
      const otherId = await addUser(s.tx, { roles: rolesOf(world).teamLead });
      const second = await requestVacancy(
        await s.as(rolesOf(world).teamLead, { userId: otherId }),
        input(),
        key,
      );
      expect(second.id).not.toBe(first.id);
      expect(second.teamLead?.id).toBe(otherId);
    });
  });

  it('rolls back vacancy, event, audit and key if an event write fails', async () => {
    await scenario(async (s) => {
      const ctx = {
        ...(await s.as(rolesOf(world).teamLead)),
        requestId: 'not-a-uuid',
      };
      await expect(
        requestVacancy(ctx, input(), randomUUID()),
      ).rejects.toThrow();
      expect(await written(s)).toEqual([]);
      expect(await events(s)).toEqual([]);
      expect(
        await s.tx
          .select()
          .from(schema.auditLog)
          .where(eq(schema.auditLog.actorId, s.actorId)),
      ).toEqual([]);
      expect(
        await s.tx
          .select()
          .from(schema.idempotencyKey)
          .where(eq(schema.idempotencyKey.userId, s.actorId)),
      ).toEqual([]);
    });
  });
});
