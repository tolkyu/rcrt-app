import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ZodError } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import { VACANCY_WRITE_RATE_LIMIT } from '../../lib/schemas/vacancy';
import type { ChangeVacancyStatusInput } from '../../lib/schemas/vacancy-status';
import type { RequestContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import {
  getVacancyDetail,
  listVacancyPage,
} from '../../server/services/vacancy';
import { changeVacancyStatus } from '../../server/services/vacancy-status';
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
let filled: string;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
  scenario = createScenarioRunner(client);
  filled = await world.addVacancy({
    title: `Закрита ${world.tag}`,
    status: 'FILLED',
    closed_at: WORLD_OPENED_AT,
    headcount: 2,
  });
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), probe.end(), client.end()]);
});

const roles = () => rolesOf(world);
type Scenario = Parameters<Parameters<typeof scenario>[0]>[0];
type Action = ChangeVacancyStatusInput['action'];

const REASON = 'Бюджет заморожено\nПовернемось у січні';
const body = (action: Action, expectedVersion = 1): ChangeVacancyStatusInput =>
  action === 'CANCEL'
    ? { action, reason: REASON, expectedVersion }
    : { action, expectedVersion };
const change = (
  ctx: RequestContext,
  id: string,
  action: Action,
  expectedVersion = 1,
) => changeVacancyStatus(ctx, id, body(action, expectedVersion));

const stored = async (s: Scenario, id: string) =>
  (
    await s.tx
      .select({
        status: schema.vacancy.status,
        version: schema.vacancy.version,
        openedAt: schema.vacancy.openedAt,
        closedAt: schema.vacancy.closedAt,
        cancelledAt: schema.vacancy.cancelledAt,
        headcount: schema.vacancy.headcount,
      })
      .from(schema.vacancy)
      .where(eq(schema.vacancy.id, id))
  )[0]!;
const eventsOf = (s: Scenario, id: string) =>
  s.tx
    .select()
    .from(schema.entityEvent)
    .where(eq(schema.entityEvent.vacancyId, id))
    .orderBy(schema.entityEvent.id);
const piiOf = async (s: Scenario, id: string) => {
  const events = await eventsOf(s, id);
  if (events.length === 0) return [];
  return s.tx
    .select()
    .from(schema.entityEventPii)
    .where(
      inArray(
        schema.entityEventPii.eventId,
        events.map((event) => event.id),
      ),
    );
};
const serialized = (rows: unknown) =>
  JSON.stringify(rows, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
const auditsOf = (s: Scenario, id: string) =>
  s.tx.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, id));

/** Denied and rejected calls leave the row, the events, the side rows and the audit log exactly as they were. */
async function expectUntouched(s: Scenario, id: string, before: object) {
  expect(await stored(s, id)).toEqual(before);
  expect(await eventsOf(s, id)).toEqual([]);
  expect(await piiOf(s, id)).toEqual([]);
  expect(await auditsOf(s, id)).toEqual([]);
}
const denied = async (
  s: Scenario,
  id: string,
  ctx: RequestContext,
  action: Action,
  expected: { status: number; code?: string },
  version = 1,
) => {
  const before = await stored(s, id);
  expect(await problem(change(ctx, id, action, version))).toMatchObject(
    expected,
  );
  await expectUntouched(s, id, before);
};
const asTeamLead = (s: Scenario, userId = world.users.tlA) =>
  s.as(roles().teamLead, { userId });

describe('Status actions, allowed callers [STORY-VAC-02-1, D130]', () => {
  it.each(['head', 'admin'] as const)(
    '%s pauses: columns, one event, one audit row without free text',
    async (who) => {
      await scenario(async (s) => {
        const id = world.v.assignedOpen;
        const detail = await change(await s.as(roles()[who]), id, 'HOLD');
        expect(detail).toMatchObject({
          status: 'ON_HOLD',
          version: 2,
          statusActions: ['RESUME', 'CANCEL'],
        });
        expect(await stored(s, id)).toEqual({
          status: 'ON_HOLD',
          version: 2,
          openedAt: WORLD_OPENED_AT,
          closedAt: null,
          cancelledAt: null,
          headcount: 1,
        });
        const events = await eventsOf(s, id);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          actorId: s.actorId,
          occurredAt: NOW,
          verticalId: world.verticals.v1,
          type: 'vacancy.status_changed',
          payload: { v: 1, from: 'OPEN', to: 'ON_HOLD' },
        });
        expect(await piiOf(s, id)).toEqual([]);
        const audits = await auditsOf(s, id);
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
          action: 'vacancy.status_changed',
          entityType: 'vacancy',
          before: { status: 'OPEN' },
          after: { status: 'ON_HOLD' },
        });
      });
    },
  );

  it('resume keeps the opening date', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOnHold;
      const detail = await change(await s.as(roles().head), id, 'RESUME');
      expect(detail).toMatchObject({ status: 'OPEN', version: 2 });
      expect(await stored(s, id)).toMatchObject({
        openedAt: WORLD_OPENED_AT,
        closedAt: null,
      });
    });
  });

  it.each([
    ['OPEN', () => world.v.assignedOpen],
    ['ON_HOLD', () => world.v.unassignedOnHold],
  ] as const)(
    'cancel from %s closes it: reason in the side row only, never in event payload or audit',
    async (_name, pick) => {
      await scenario(async (s) => {
        const id = pick();
        const detail = await change(await s.as(roles().head), id, 'CANCEL');
        expect(detail).toMatchObject({
          status: 'CANCELLED',
          version: 2,
          statusActions: [],
          cancelReason: REASON,
        });
        expect(await stored(s, id)).toMatchObject({
          status: 'CANCELLED',
          closedAt: NOW,
          cancelledAt: NOW,
          openedAt: WORLD_OPENED_AT,
        });
        const events = await eventsOf(s, id);
        expect(events).toHaveLength(1);
        expect(events[0]?.payload).toMatchObject({ to: 'CANCELLED' });
        const pii = await piiOf(s, id);
        expect(pii).toHaveLength(1);
        expect(pii[0]?.data).toEqual({ reason: REASON });
        expect(serialized(events)).not.toContain('Бюджет');
        expect(serialized(await auditsOf(s, id))).not.toContain('Бюджет');
      });
    },
  );

  it('the reason is read by everyone who reads the vacancy and by nobody else', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      await change(await s.as(roles().head), id, 'CANCEL');
      for (const ctx of [
        await s.as(roles().hr),
        await s.as(roles().headHr),
        await s.as(roles().admin),
        await s.as(roles().recruiter, { userId: world.users.recA }),
        await asTeamLead(s),
      ])
        expect((await getVacancyDetail(ctx, id)).cancelReason).toBe(REASON);
      for (const ctx of [
        await s.as(roles().headOther),
        await s.as(roles().finance),
        await asTeamLead(s, world.users.tlB),
      ])
        expect(await problem(getVacancyDetail(ctx, id))).toMatchObject({
          status: 404,
        });
    });
  });

  it('a Team Lead pauses, resumes and cancels the vacancy they lead', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await asTeamLead(s);
      expect(await change(ctx, id, 'HOLD')).toMatchObject({
        status: 'ON_HOLD',
        statusActions: ['RESUME', 'CANCEL'],
      });
      expect(await change(ctx, id, 'RESUME', 2)).toMatchObject({
        status: 'OPEN',
      });
      expect(await change(ctx, id, 'CANCEL', 3)).toMatchObject({
        status: 'CANCELLED',
        version: 4,
      });
    });
  });

  it('reopens FILLED without a headcount: closed_at cleared, headcount kept, one event', async () => {
    await scenario(async (s) => {
      const detail = await change(await s.as(roles().head), filled, 'REOPEN');
      expect(detail).toMatchObject({
        status: 'OPEN',
        version: 2,
        statusActions: ['HOLD', 'CANCEL'],
      });
      expect(await stored(s, filled)).toMatchObject({
        status: 'OPEN',
        closedAt: null,
        cancelledAt: null,
        headcount: 2,
        openedAt: WORLD_OPENED_AT,
      });
      expect((await eventsOf(s, filled)).map((event) => event.type)).toEqual([
        'vacancy.status_changed',
      ]);
    });
  });

  it('reopens FILLED with a new headcount: updated event and audit carry the field name and numbers only', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().admin);
      const detail = await changeVacancyStatus(ctx, filled, {
        action: 'REOPEN',
        headcount: 5,
        expectedVersion: 1,
      });
      expect(detail).toMatchObject({
        status: 'OPEN',
        headcount: 5,
        version: 2,
      });
      const events = await eventsOf(s, filled);
      expect(events.map((event) => event.type)).toEqual([
        'vacancy.status_changed',
        'vacancy.updated',
      ]);
      expect(events[1]?.payload).toEqual({ v: 1, fields: ['headcount'] });
      const [audit] = await auditsOf(s, filled);
      expect(audit).toMatchObject({
        before: { status: 'FILLED', headcount: 2 },
        after: { status: 'OPEN', headcount: 5 },
      });
    });
  });

  it('reopen with the headcount already stored writes no updated event', async () => {
    await scenario(async (s) => {
      await changeVacancyStatus(await s.as(roles().head), filled, {
        action: 'REOPEN',
        headcount: 2,
        expectedVersion: 1,
      });
      expect((await eventsOf(s, filled)).map((event) => event.type)).toEqual([
        'vacancy.status_changed',
      ]);
    });
  });
});

describe('Status actions, repeat and illegal pairs [D130, ADR-017]', () => {
  it.each([
    ['HOLD', () => world.v.unassignedOnHold],
    ['RESUME', () => world.v.assignedOpen],
    ['REOPEN', () => world.v.assignedOpen],
  ] as const)(
    '%s on a vacancy already there is 200 and writes nothing',
    async (action, pick) => {
      await scenario(async (s) => {
        const id = pick();
        const before = await stored(s, id);
        const detail = await change(await s.as(roles().head), id, action);
        expect(detail.version).toBe(1);
        await expectUntouched(s, id, before);
      });
    },
  );

  it('a repeat at a stale version is still 200: the caller already has what they asked for', async () => {
    await scenario(async (s) => {
      const detail = await change(
        await s.as(roles().head),
        world.v.assignedOpen,
        'RESUME',
        9,
      );
      expect(detail.status).toBe('OPEN');
    });
  });

  const illegal: readonly (readonly [string, () => string, Action])[] = [
    ['ON_HOLD', () => world.v.unassignedOnHold, 'REOPEN'],
    ['FILLED', () => filled, 'HOLD'],
    ['FILLED', () => filled, 'RESUME'],
    ['FILLED', () => filled, 'CANCEL'],
    ['CANCELLED', () => world.v.cancelled, 'HOLD'],
    ['CANCELLED', () => world.v.cancelled, 'RESUME'],
    ['CANCELLED', () => world.v.cancelled, 'CANCEL'],
    ['CANCELLED', () => world.v.cancelled, 'REOPEN'],
  ];
  it.each(illegal)(
    '%s does not allow %s: 409 VACANCY_STATUS_INVALID',
    async (_status, pick, action) => {
      await scenario(async (s) => {
        await denied(s, pick(), await s.as(roles().head), action, {
          status: 409,
          code: 'VACANCY_STATUS_INVALID',
        });
      });
    },
  );

  it.each(['HOLD', 'RESUME', 'CANCEL', 'REOPEN'] as const)(
    'the author of a draft gets 409 on %s and the draft gets no event or audit row (D92)',
    async (action) => {
      await scenario(async (s) => {
        const ctx = await s.as(roles().head, { userId: world.users.admin });
        await denied(s, world.v.draft, ctx, action, {
          status: 409,
          code: 'VACANCY_STATUS_INVALID',
        });
      });
    },
  );

  it('REOPEN with a headcount on an OPEN vacancy is a conflict, not a silent no-op', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const before = await stored(s, id);
      expect(
        await problem(
          changeVacancyStatus(await s.as(roles().head), id, {
            action: 'REOPEN',
            headcount: 4,
            expectedVersion: 1,
          }),
        ),
      ).toMatchObject({ status: 409, code: 'VACANCY_STATUS_INVALID' });
      await expectUntouched(s, id, before);
    });
  });

  it('a stale version is 409 STALE_STATE and an illegal pair wins over a stale version', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head);
      await denied(
        s,
        world.v.assignedOpen,
        ctx,
        'HOLD',
        { status: 409, code: 'STALE_STATE' },
        7,
      );
      await denied(
        s,
        world.v.cancelled,
        ctx,
        'CANCEL',
        { status: 409, code: 'VACANCY_STATUS_INVALID' },
        7,
      );
    });
  });

  it('a replay of the old version after a change is 409 STALE_STATE', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(roles().head);
      await change(ctx, id, 'HOLD');
      expect(await problem(change(ctx, id, 'CANCEL', 1))).toMatchObject({
        status: 409,
        code: 'STALE_STATE',
      });
      expect(await change(ctx, id, 'CANCEL', 2)).toMatchObject({ version: 3 });
    });
  });
});

describe('Status actions, denied callers [SEC prereview 3.1-3.14]', () => {
  it.each([
    ['Recruiter', 'recruiter'],
    ['HR', 'hr'],
    ['Head HR', 'headHr'],
  ] as const)(
    '%s is 403 on every action, repeats included',
    async (_name, who) => {
      await scenario(async (s) => {
        const ctx = await s.as(roles()[who]);
        for (const [id, action] of [
          [world.v.assignedOpen, 'HOLD'],
          [world.v.assignedOpen, 'RESUME'],
          [world.v.assignedOpen, 'CANCEL'],
          [world.v.assignedOpen, 'REOPEN'],
          [world.v.unassignedOnHold, 'HOLD'],
        ] as const)
          await denied(s, id, ctx, action, { status: 403, code: 'FORBIDDEN' });
      });
    },
  );

  it('an assigned Recruiter is 403 on the vacancy they work', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().recruiter, { userId: world.users.recA });
      await denied(s, world.v.assignedOpen, ctx, 'HOLD', { status: 403 });
    });
  });

  it('Finance has no vacancy read: 404', async () => {
    await scenario(async (s) => {
      await denied(
        s,
        world.v.assignedOpen,
        await s.as(roles().finance),
        'HOLD',
        { status: 404 },
      );
    });
  });

  it.each([
    ['own FILLED', () => filled],
    [
      'own OPEN (a repeat must not mask the denial)',
      () => world.v.assignedOpen,
    ],
  ] as const)('a Team Lead cannot REOPEN %s: 403', async (_name, pick) => {
    await scenario(async (s) => {
      await denied(s, pick(), await asTeamLead(s), 'REOPEN', {
        status: 403,
        code: 'FORBIDDEN',
      });
    });
  });

  it.each(['HOLD', 'RESUME', 'CANCEL', 'REOPEN'] as const)(
    'another Team Lead of the vertical gets 404 on %s',
    async (action) => {
      await scenario(async (s) => {
        await denied(
          s,
          world.v.assignedOpen,
          await asTeamLead(s, world.users.tlB),
          action,
          { status: 404 },
        );
      });
    },
  );

  it('a Team Lead gets 404 on a recruiter-initiated vacancy without a Team Lead', async () => {
    await scenario(async (s) => {
      await denied(s, world.v.recruiterInitiated, await asTeamLead(s), 'HOLD', {
        status: 404,
      });
    });
  });

  it('a Team Lead of one vertical who heads recruiting in another is denied in the first', async () => {
    await scenario(async (s) => {
      const mixed: Roles = [
        { role: 'TEAM_LEAD', verticalId: world.verticals.v1 },
        { role: 'HEAD_RECRUITER', verticalId: world.verticals.v2 },
      ];
      const ctx = await s.as(mixed, { userId: world.users.tlA });
      await denied(s, filled, ctx, 'REOPEN', { status: 403 });
      expect(await change(ctx, world.v.otherAssigned, 'HOLD')).toMatchObject({
        status: 'ON_HOLD',
      });
    });
  });

  it('a Head Recruiter of another vertical gets 404', async () => {
    await scenario(async (s) => {
      await denied(
        s,
        world.v.assignedOpen,
        await s.as(roles().headOther),
        'HOLD',
        { status: 404 },
      );
    });
  });

  it.each(['admin', 'head'] as const)(
    'someone else draft is 404 for %s',
    async (who) => {
      await scenario(async (s) => {
        await denied(s, world.v.draft, await s.as(roles()[who]), 'CANCEL', {
          status: 404,
        });
      });
    },
  );

  it('Admin without aal2 is 401 MFA_REQUIRED', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().admin, { aal: 'aal1' });
      await denied(s, world.v.assignedOpen, ctx, 'HOLD', {
        status: 401,
        code: 'MFA_REQUIRED',
      });
    });
  });

  it('a deleted vacancy, an unknown id and a malformed id are 404', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().admin);
      for (const id of [world.v.deleted, randomUUID(), 'not-a-uuid'])
        expect(await problem(change(ctx, id, 'HOLD'))).toMatchObject({
          status: 404,
        });
    });
  });

  it('a cancelled draft that never opened stays closed for its author: 409', async () => {
    await scenario(async (s) => {
      const id = await world.addVacancy({
        title: `Скасована чернетка ${world.tag}`,
        status: 'CANCELLED',
        opened_at: null,
        closed_at: WORLD_OPENED_AT,
        cancelled_at: WORLD_OPENED_AT,
      });
      const ctx = await s.as(roles().head, { userId: world.users.admin });
      await denied(s, id, ctx, 'REOPEN', {
        status: 409,
        code: 'VACANCY_STATUS_INVALID',
      });
    });
  });

  it('the database itself refuses to leave CANCELLED', async () => {
    await expect(
      admin`update app.vacancy set status = 'OPEN', closed_at = null, cancelled_at = null where id = ${world.v.cancelled}`,
    ).rejects.toThrow();
  });
});

describe('Status request bodies are strict [SEC prereview 3.7, 3.9]', () => {
  const headcounts = [0, -1, 1.5, 101, 40000, '3', null];
  const bad: readonly (readonly [string, unknown])[] = [
    ['FILL action', { action: 'FILL', expectedVersion: 1 }],
    ['lower case action', { action: 'hold', expectedVersion: 1 }],
    ['status instead of action', { status: 'FILLED', expectedVersion: 1 }],
    ['no version', { action: 'HOLD' }],
    ['version 0', { action: 'HOLD', expectedVersion: 0 }],
    ['version string', { action: 'HOLD', expectedVersion: '1' }],
    ['extra key', { action: 'HOLD', expectedVersion: 1, status: 'FILLED' }],
    ['reason on HOLD', { action: 'HOLD', expectedVersion: 1, reason: 'x' }],
    ['reason on RESUME', { action: 'RESUME', expectedVersion: 1, reason: 'x' }],
    ['reason on REOPEN', { action: 'REOPEN', expectedVersion: 1, reason: 'x' }],
    ['headcount on HOLD', { action: 'HOLD', expectedVersion: 1, headcount: 2 }],
    [
      'headcount on CANCEL',
      { action: 'CANCEL', reason: 'x', expectedVersion: 1, headcount: 2 },
    ],
    ['CANCEL without reason', { action: 'CANCEL', expectedVersion: 1 }],
    ['empty reason', { action: 'CANCEL', reason: '', expectedVersion: 1 }],
    ['blank reason', { action: 'CANCEL', reason: ' \n  ', expectedVersion: 1 }],
    [
      'long reason',
      { action: 'CANCEL', reason: 'я'.repeat(501), expectedVersion: 1 },
    ],
    ...headcounts.map((headcount): readonly [string, unknown] => [
      `headcount ${String(headcount)}`,
      { action: 'REOPEN', headcount, expectedVersion: 1 },
    ]),
  ];
  it.each(bad)(
    '%s is refused before any lookup and writes nothing',
    async (_name, input) => {
      await scenario(async (s) => {
        const before = await stored(s, filled);
        await expect(
          changeVacancyStatus(
            await s.as(roles().head),
            filled,
            input as ChangeVacancyStatusInput,
          ),
        ).rejects.toBeInstanceOf(ZodError);
        await expectUntouched(s, filled, before);
      });
    },
  );

  it('accepts the headcount bound 100', async () => {
    await scenario(async (s) => {
      await changeVacancyStatus(await s.as(roles().head), filled, {
        action: 'REOPEN',
        headcount: 100,
        expectedVersion: 1,
      });
      expect(await stored(s, filled)).toMatchObject({ headcount: 100 });
    });
  });
});

describe('Pause and resume move a vacancy in and out of recruiter lists [D130-5]', () => {
  const idsOf = async (ctx: RequestContext) =>
    (await listVacancyPage(ctx, { limit: 100 })).items.map((item) => item.id);

  it('a paused unassigned vacancy leaves a Recruiter list until RESUME; an assigned Recruiter keeps seeing it', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOpen;
      const head = await s.as(roles().head);
      const free = await s.as(roles().recruiter, { userId: world.users.recB });
      const assigned = await s.as(roles().recruiter, {
        userId: world.users.recA,
      });
      expect(await idsOf(free)).toContain(id);
      await change(head, id, 'HOLD');
      expect(await idsOf(free)).not.toContain(id);
      expect(await problem(getVacancyDetail(free, id))).toMatchObject({
        status: 404,
      });
      await change(head, id, 'RESUME', 2);
      expect(await idsOf(free)).toContain(id);

      const worked = world.v.assignedOpen;
      await change(head, worked, 'HOLD');
      expect(await idsOf(assigned)).toContain(worked);
      expect(await getVacancyDetail(assigned, worked)).toMatchObject({
        status: 'ON_HOLD',
        statusActions: [],
      });
    });
  });
});

describe('Status write throttle [SEC-CORE-09]', () => {
  it(`counts every call: the ${VACANCY_WRITE_RATE_LIMIT.perUser + 1}th inside a minute is 429`, async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(roles().head);
      for (let n = 0; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        await change(ctx, id, 'RESUME');
      const before = await stored(s, id);
      expect(await problem(change(ctx, id, 'HOLD'))).toMatchObject({
        status: 429,
        code: 'RATE_LIMITED',
      });
      expect(await stored(s, id)).toEqual(before);
    });
  });
});

describe('Status changes on committed rows [ADR-017 concurrency, PERF-02]', () => {
  const raceWithLock = createLockRace(admin, probe);
  let fixture: { verticalId: string; positionId: string; headRoles: Roles };

  const newUser = async (role: string) => {
    const userId = randomUUID();
    await admin`insert into app.app_user (id, email, full_name) values (${userId}, ${`${userId}@fixture.test`}, 'Користувач гонки статусу')`;
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${userId}, ${role}, ${fixture.verticalId})`;
    return userId;
  };
  const newVacancy = async (createdBy: string, teamLeadId: string | null) => {
    const id = randomUUID();
    await admin`insert into app.vacancy (id, vertical_id, position_id, title, team_lead_id, recruiter_initiated, status, opened_at, created_by)
      values (${id}, ${fixture.verticalId}, ${fixture.positionId}, 'Гонка статусу', ${teamLeadId}, ${teamLeadId === null}, 'OPEN', ${WORLD_OPENED_AT}, ${createdBy})`;
    return id;
  };
  const ctx = (userId: string, held: Roles = fixture.headRoles) =>
    contextFor(drizzle(client, { schema }), userId, held);
  const countOf = async (id: string) =>
    (
      await admin`select count(*)::int as n from app.entity_event where vacancy_id = ${id}`
    )[0]!.n as number;

  beforeAll(async () => {
    const verticalId = randomUUID();
    const positionId = randomUUID();
    const owner = randomUUID();
    const name = `Статус ${verticalId.slice(0, 8)}`;
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

  it('pause and cancel from one version: one wins, the loser is 409 and wrote nothing, one event', async () => {
    const head = await newUser('HEAD_RECRUITER');
    const id = await newVacancy(head, null);
    const settled = await Promise.allSettled([
      changeVacancyStatus(ctx(head), id, body('HOLD')),
      changeVacancyStatus(ctx(head), id, body('CANCEL')),
    ]);
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = settled.find((r) => r.status === 'rejected');
    const lost = await problem(Promise.reject(failure!.reason));
    expect(lost.status).toBe(409);
    expect(['STALE_STATE', 'VACANCY_STATUS_INVALID']).toContain(lost.code);
    expect(await countOf(id)).toBe(1);
    const [row] = await admin`select version from app.vacancy where id = ${id}`;
    expect(row!.version).toBe(2);
  });

  it('a Team Lead whose role is removed while the request waits is 403 and nothing is written', async () => {
    const head = await newUser('HEAD_RECRUITER');
    const teamLead = await newUser('TEAM_LEAD');
    const id = await newVacancy(head, teamLead);
    const refused = await raceWithLock(
      (tx) =>
        tx`select id from app.app_user where id = ${teamLead} for no key update`,
      async (tx) => {
        await tx`delete from app.user_role where user_id = ${teamLead}`;
      },
      () =>
        problem(
          changeVacancyStatus(
            ctx(teamLead, [
              { role: 'TEAM_LEAD', verticalId: fixture.verticalId },
            ]),
            id,
            body('CANCEL'),
          ),
        ),
    );
    expect(refused).toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(await countOf(id)).toBe(0);
    const [row] =
      await admin`select status, version from app.vacancy where id = ${id}`;
    expect(row).toEqual({ status: 'OPEN', version: 1 });
  });

  it('changes in at most 13 statements, one of them the compare-and-set write [PERF-02]', async () => {
    const head = await newUser('HEAD_RECRUITER');
    const id = await newVacancy(head, null);
    const logged: string[] = [];
    const counting = drizzle(client, {
      schema,
      logger: { logQuery: (query) => void logged.push(query) },
    });
    await changeVacancyStatus(
      contextFor(counting, head, fixture.headRoles),
      id,
      body('CANCEL'),
    );
    expect(logged.length).toBeLessThanOrEqual(13);
    expect(
      logged.filter((query) => /^update "app"."vacancy"/i.test(query)),
    ).toHaveLength(1);
  });
});
