import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ZodError } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import {
  VACANCY_WRITE_RATE_LIMIT,
  type SetVacancyUrgencyInput,
} from '../../lib/schemas/vacancy';
import type { RequestContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { getVacancyDetail } from '../../server/services/vacancy';
import { setVacancyUrgency } from '../../server/services/vacancy-urgency';
import { createLockRace } from '../support/lock-race';
import {
  contextFor,
  createScenarioRunner,
  NOW,
  problem,
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
const probe = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 8, prepare: false });
let world: VacancyWorld;
let scenario: ReturnType<typeof createScenarioRunner>;
let extra: { filled: string; neverOpened: string; urgentOpen: string };

beforeAll(async () => {
  world = await createVacancyWorld(admin);
  scenario = createScenarioRunner(client);
  extra = {
    filled: await world.addVacancy({
      title: `Закрита ${world.tag}`,
      status: 'FILLED',
      closed_at: WORLD_OPENED_AT,
    }),
    neverOpened: await world.addVacancy({
      title: `Скасована чернетка ${world.tag}`,
      status: 'CANCELLED',
      opened_at: null,
      closed_at: WORLD_OPENED_AT,
      cancelled_at: WORLD_OPENED_AT,
      team_lead_id: world.users.tlB,
    }),
    urgentOpen: await world.addVacancy({
      title: `Термінова ${world.tag}`,
      priority_flag: 'URGENT',
    }),
  };
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), probe.end(), client.end()]);
});

const roles = () => rolesOf(world);
type Scenario = Parameters<Parameters<typeof scenario>[0]>[0];

const set = (
  ctx: RequestContext,
  id: string,
  priority: SetVacancyUrgencyInput['priority'],
  expectedVersion = 1,
) => setVacancyUrgency(ctx, id, { priority, expectedVersion });
const stored = async (s: Scenario, id: string) =>
  (
    await s.tx
      .select({
        priority: schema.vacancy.priorityFlag,
        version: schema.vacancy.version,
      })
      .from(schema.vacancy)
      .where(eq(schema.vacancy.id, id))
  )[0];
const eventsOf = (s: Scenario, id: string) =>
  s.tx
    .select()
    .from(schema.entityEvent)
    .where(
      and(
        eq(schema.entityEvent.vacancyId, id),
        eq(schema.entityEvent.type, 'vacancy.urgency_changed'),
      ),
    );
const auditsOf = (s: Scenario, id: string) =>
  s.tx
    .select()
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.entityId, id),
        eq(schema.auditLog.action, 'vacancy.urgency_changed'),
      ),
    );

async function expectUntouched(s: Scenario, id: string) {
  expect(await stored(s, id)).toMatchObject({ version: 1 });
  expect(await eventsOf(s, id)).toEqual([]);
  expect(await auditsOf(s, id)).toEqual([]);
}

describe('Urgency change, allowed callers [STORY-VAC-08-2, D94]', () => {
  it.each(['head', 'admin'] as const)(
    '%s sets URGENT: version +1, one event, one audit row, detail says it may change again',
    async (who) => {
      await scenario(async (s) => {
        const id = world.v.assignedOpen;
        const ctx = await s.as(roles()[who]);
        const detail = await set(ctx, id, 'URGENT');
        expect(detail).toMatchObject({
          id,
          priority: 'URGENT',
          version: 2,
          canChangeUrgency: true,
          updatedAt: NOW.toISOString(),
        });
        expect(await stored(s, id)).toEqual({ priority: 'URGENT', version: 2 });
        const events = await eventsOf(s, id);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          actorId: s.actorId,
          occurredAt: NOW,
          verticalId: world.verticals.v1,
          subjectType: 'vacancy',
          subjectId: id,
          payload: { v: 1, from: 'NORMAL', to: 'URGENT' },
        });
        const audits = await auditsOf(s, id);
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
          actorId: s.actorId,
          entityType: 'vacancy',
          before: { priority: 'NORMAL' },
          after: { priority: 'URGENT' },
        });
      });
    },
  );

  it('sets NORMAL symmetrically on an urgent vacancy', async () => {
    await scenario(async (s) => {
      const detail = await set(
        await s.as(roles().head),
        extra.urgentOpen,
        'NORMAL',
      );
      expect(detail).toMatchObject({ priority: 'NORMAL', version: 2 });
      expect((await eventsOf(s, extra.urgentOpen))[0]?.payload).toEqual({
        v: 1,
        from: 'URGENT',
        to: 'NORMAL',
      });
    });
  });

  it('Admin changes a vacancy of any vertical', async () => {
    await scenario(async (s) => {
      const id = world.v.otherUnassigned;
      expect(await set(await s.as(roles().admin), id, 'URGENT')).toMatchObject({
        priority: 'URGENT',
      });
    });
  });

  it('allows ON_HOLD', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOnHold;
      expect(await set(await s.as(roles().head), id, 'URGENT')).toMatchObject({
        status: 'ON_HOLD',
        priority: 'URGENT',
        canChangeUrgency: true,
      });
    });
  });

  it('a Team Lead who also heads recruiting in the vertical may change it', async () => {
    await scenario(async (s) => {
      const both: Roles = [
        { role: 'TEAM_LEAD', verticalId: world.verticals.v1 },
        { role: 'HEAD_RECRUITER', verticalId: world.verticals.v1 },
      ];
      expect(
        await set(await s.as(both), world.v.assignedOpen, 'URGENT'),
      ).toMatchObject({ priority: 'URGENT' });
    });
  });

  it('writes nothing to the Team Lead priority rows', async () => {
    await scenario(async (s) => {
      const rows = () => s.tx.select().from(schema.teamLeadPriority);
      const before = await rows();
      await set(await s.as(roles().head), world.v.assignedOpen, 'URGENT');
      expect(await rows()).toEqual(before);
    });
  });
});

describe('Urgency change, denied callers [STORY-VAC-08-2, D94, D92]', () => {
  it.each([
    ['Recruiter', 'recruiter'],
    ['HR', 'hr'],
    ['Head HR', 'headHr'],
  ] as const)('%s is 403 and nothing is written', async (_name, who) => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      expect(
        await problem(set(await s.as(roles()[who]), id, 'URGENT')),
      ).toMatchObject({ status: 403, code: 'FORBIDDEN' });
      await expectUntouched(s, id);
    });
  });

  it('an assigned Recruiter is 403 on the vacancy they work', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(roles().recruiter, { userId: world.users.recA });
      expect(await problem(set(ctx, id, 'URGENT'))).toMatchObject({
        status: 403,
      });
      await expectUntouched(s, id);
    });
  });

  it('a Team Lead is 403 on the vacancy they requested', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(roles().teamLead, { userId: world.users.tlA });
      expect(await problem(set(ctx, id, 'URGENT'))).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
      await expectUntouched(s, id);
    });
  });

  it('another Team Lead of the vertical gets 404, not 403', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(roles().teamLead, { userId: world.users.tlB });
      expect(await problem(set(ctx, id, 'URGENT'))).toMatchObject({
        status: 404,
      });
      await expectUntouched(s, id);
    });
  });

  it('a Team Lead of one vertical who heads recruiting in another is denied in the first', async () => {
    await scenario(async (s) => {
      const mixed: Roles = [
        { role: 'TEAM_LEAD', verticalId: world.verticals.v1 },
        { role: 'HEAD_RECRUITER', verticalId: world.verticals.v2 },
      ];
      const ctx = await s.as(mixed, { userId: world.users.tlA });
      expect(
        await problem(set(ctx, world.v.assignedOpen, 'URGENT')),
      ).toMatchObject({ status: 403 });
      expect(await set(ctx, world.v.otherUnassigned, 'URGENT')).toMatchObject({
        priority: 'URGENT',
      });
    });
  });

  it('Finance has no vacancy read: 404', async () => {
    await scenario(async (s) => {
      expect(
        await problem(
          set(await s.as(roles().finance), world.v.assignedOpen, 'URGENT'),
        ),
      ).toMatchObject({ status: 404 });
      await expectUntouched(s, world.v.assignedOpen);
    });
  });

  it('a Head Recruiter of another vertical gets 404', async () => {
    await scenario(async (s) => {
      expect(
        await problem(
          set(await s.as(roles().headOther), world.v.assignedOpen, 'URGENT'),
        ),
      ).toMatchObject({ status: 404 });
      await expectUntouched(s, world.v.assignedOpen);
    });
  });

  it('Admin without aal2 is 401 MFA_REQUIRED', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().admin, { aal: 'aal1' });
      expect(
        await problem(set(ctx, world.v.assignedOpen, 'URGENT')),
      ).toMatchObject({ status: 401, code: 'MFA_REQUIRED' });
      await expectUntouched(s, world.v.assignedOpen);
    });
  });

  it.each(['admin', 'head'] as const)(
    'someone else draft is 404 for %s',
    async (who) => {
      await scenario(async (s) => {
        expect(
          await problem(set(await s.as(roles()[who]), world.v.draft, 'URGENT')),
        ).toMatchObject({ status: 404 });
        await expectUntouched(s, world.v.draft);
      });
    },
  );

  it('a deleted vacancy and an unknown id are 404', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().admin);
      for (const id of [world.v.deleted, randomUUID(), 'not-a-uuid'])
        expect(await problem(set(ctx, id, 'URGENT'))).toMatchObject({
          status: 404,
        });
    });
  });
});

describe('Urgency change, status and version rules [D127, D99]', () => {
  it.each([
    ['FILLED', () => extra.filled],
    ['CANCELLED after opening', () => world.v.cancelled],
  ] as const)('%s is 409 VACANCY_URGENCY_LOCKED', async (_name, pick) => {
    await scenario(async (s) => {
      const id = pick();
      expect(
        await problem(set(await s.as(roles().head), id, 'URGENT')),
      ).toMatchObject({ status: 409, code: 'VACANCY_URGENCY_LOCKED' });
      await expectUntouched(s, id);
    });
  });

  it('the author of a draft is 409 VACANCY_URGENCY_LOCKED, the draft edit is their path', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head, { userId: world.users.admin });
      expect(await problem(set(ctx, world.v.draft, 'URGENT'))).toMatchObject({
        status: 409,
        code: 'VACANCY_URGENCY_LOCKED',
      });
      await expectUntouched(s, world.v.draft);
    });
  });

  it('a cancelled draft that never opened is 409 for the author, 404 for the rest', async () => {
    await scenario(async (s) => {
      const author = await s.as(roles().head, { userId: world.users.admin });
      expect(
        await problem(set(author, extra.neverOpened, 'URGENT')),
      ).toMatchObject({ status: 409, code: 'VACANCY_URGENCY_LOCKED' });
      expect(
        await problem(
          set(await s.as(roles().head), extra.neverOpened, 'URGENT'),
        ),
      ).toMatchObject({ status: 404 });
    });
  });

  it('a stale version is 409 STALE_STATE and nothing changes', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      expect(
        await problem(set(await s.as(roles().head), id, 'URGENT', 7)),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
      await expectUntouched(s, id);
    });
  });

  it('the same value at the current version is 200 and writes nothing', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const detail = await set(await s.as(roles().head), id, 'NORMAL');
      expect(detail).toMatchObject({ priority: 'NORMAL', version: 1 });
      await expectUntouched(s, id);
    });
  });

  it('the same value at a stale version is still 409', async () => {
    await scenario(async (s) => {
      expect(
        await problem(
          set(await s.as(roles().head), world.v.assignedOpen, 'NORMAL', 3),
        ),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
    });
  });

  it('a second change from the first answer works and a replay of the old version does not', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(roles().head);
      const first = await set(ctx, id, 'URGENT');
      expect(await set(ctx, id, 'NORMAL', first.version)).toMatchObject({
        priority: 'NORMAL',
        version: 3,
      });
      expect(
        await problem(set(ctx, id, 'URGENT', first.version)),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
      expect(await eventsOf(s, id)).toHaveLength(2);
    });
  });

  it('refuses a body with other fields before any lookup and writes nothing', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head);
      const id = world.v.assignedOpen;
      for (const body of [
        { priority: 'URGENT', expectedVersion: 1, status: 'FILLED' },
        { priority: 'ASAP', expectedVersion: 1 },
        { priority: 'URGENT' },
      ])
        await expect(
          setVacancyUrgency(ctx, id, body as SetVacancyUrgencyInput),
        ).rejects.toBeInstanceOf(ZodError);
      await expectUntouched(s, id);
    });
  });
});

describe('Urgency flag on the detail [STORY-VAC-08-2]', () => {
  it.each([
    ['head', 'assignedOpen', true],
    ['admin', 'otherUnassigned', true],
    ['head', 'unassignedOnHold', true],
    ['head', 'cancelled', false],
    ['teamLead', 'assignedOpen', false],
    ['recruiter', 'assignedOpen', false],
    ['hr', 'assignedOpen', false],
  ] as const)(
    '%s reading %s sees canChangeUrgency %s',
    async (who, key, expected) => {
      await scenario(async (s) => {
        const userId =
          who === 'teamLead'
            ? world.users.tlA
            : who === 'recruiter'
              ? world.users.recA
              : undefined;
        const ctx = await s.as(roles()[who], userId ? { userId } : {});
        expect(await getVacancyDetail(ctx, world.v[key])).toMatchObject({
          canChangeUrgency: expected,
        });
      });
    },
  );

  it('the flag is false on the author own draft', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head, { userId: world.users.admin });
      expect(await getVacancyDetail(ctx, world.v.draft)).toMatchObject({
        status: 'DRAFT',
        canChangeUrgency: false,
      });
    });
  });
});

describe('Urgency write throttle [SEC-CORE-09]', () => {
  it(`counts every call: the ${VACANCY_WRITE_RATE_LIMIT.perUser + 1}th inside a minute is 429`, async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(roles().head);
      for (let n = 0; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        await set(ctx, id, 'NORMAL');
      expect(await problem(set(ctx, id, 'URGENT'))).toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
      });
      expect(await stored(s, id)).toEqual({ priority: 'NORMAL', version: 1 });
    });
  });
});

describe('Urgency change on committed rows [ADR-016 concurrency, PERF-02]', () => {
  const raceWithLock = createLockRace(admin, probe);
  let fixture: { verticalId: string; positionId: string; headRoles: Roles };

  const newHead = async () => {
    const userId = randomUUID();
    await admin`insert into app.app_user (id, email, full_name) values (${userId}, ${`${userId}@fixture.test`}, 'Керівник рекрутингу гонки')`;
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${userId}, 'HEAD_RECRUITER', ${fixture.verticalId})`;
    return userId;
  };
  const newVacancy = async (createdBy: string) => {
    const id = randomUUID();
    await admin`insert into app.vacancy (id, vertical_id, position_id, title, recruiter_initiated, status, opened_at, created_by)
      values (${id}, ${fixture.verticalId}, ${fixture.positionId}, 'Гонка терміновості', true, 'OPEN', ${WORLD_OPENED_AT}, ${createdBy})`;
    return id;
  };
  const ctx = (userId: string) =>
    contextFor(drizzle(client, { schema }), userId, fixture.headRoles);
  const countOf = async (id: string) =>
    (
      await admin`select count(*)::int as n from app.entity_event where vacancy_id = ${id} and type = 'vacancy.urgency_changed'`
    )[0]!.n as number;

  beforeAll(async () => {
    const verticalId = randomUUID();
    const positionId = randomUUID();
    const owner = randomUUID();
    const name = `Терміновість ${verticalId.slice(0, 8)}`;
    await admin`insert into app.vertical (id, name) values (${verticalId}, ${`Світ ${name}`})`;
    await admin`insert into app.app_user (id, email, full_name) values (${owner}, ${`${owner}@fixture.test`}, 'Власник позиції')`;
    await admin`insert into app.position (id, vertical_id, name, name_key, created_by)
      values (${positionId}, ${verticalId}, ${name}, ${positionNameKey(name)}, ${owner})`;
    fixture = {
      verticalId,
      positionId,
      headRoles: [{ role: 'HEAD_RECRUITER', verticalId }],
    };
  });

  it('two parallel calls from one version: one 200, one 409 STALE_STATE, exactly one event', async () => {
    const head = await newHead();
    const id = await newVacancy(head);
    const settled = await Promise.allSettled([
      setVacancyUrgency(ctx(head), id, {
        priority: 'URGENT',
        expectedVersion: 1,
      }),
      setVacancyUrgency(ctx(head), id, {
        priority: 'URGENT',
        expectedVersion: 1,
      }),
    ]);
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = settled.find((r) => r.status === 'rejected');
    expect(await problem(Promise.reject(failure!.reason))).toMatchObject({
      status: 409,
      code: 'STALE_STATE',
    });
    expect(await countOf(id)).toBe(1);
    const [row] = await admin`select version from app.vacancy where id = ${id}`;
    expect(row!.version).toBe(2);
  });

  it('a change queued behind the removal of the caller own grant is 403 and writes nothing', async () => {
    const head = await newHead();
    const id = await newVacancy(head);
    const refused = await raceWithLock(
      (tx) =>
        tx`select id from app.app_user where id = ${head} for no key update`,
      async (tx) => {
        await tx`delete from app.user_role where user_id = ${head}`;
      },
      () =>
        problem(
          setVacancyUrgency(ctx(head), id, {
            priority: 'URGENT',
            expectedVersion: 1,
          }),
        ),
    );
    expect(refused).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(await countOf(id)).toBe(0);
    const [row] =
      await admin`select priority_flag, version from app.vacancy where id = ${id}`;
    expect(row).toEqual({ priority_flag: 'NORMAL', version: 1 });
  });

  it('changes in at most 12 statements, one of them the compare-and-set write [PERF-02]', async () => {
    const head = await newHead();
    const id = await newVacancy(head);
    const logged: string[] = [];
    const counting = drizzle(client, {
      schema,
      logger: { logQuery: (query) => void logged.push(query) },
    });
    await setVacancyUrgency(contextFor(counting, head, fixture.headRoles), id, {
      priority: 'URGENT',
      expectedVersion: 1,
    });
    expect(logged.length).toBeLessThanOrEqual(12);
    expect(
      logged.filter((query) => /^update "app"."vacancy"/i.test(query)),
    ).toHaveLength(1);
  });
});
