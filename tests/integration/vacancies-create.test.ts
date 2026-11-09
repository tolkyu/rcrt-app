import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IDEMPOTENCY_TTL_MS } from '../../lib/idempotency';
import { positionNameKey } from '../../lib/position-name';
import {
  VACANCY_DAILY_CREATE_LIMIT,
  VACANCY_DRAFT_LIMIT,
  VACANCY_WRITE_RATE_LIMIT,
  type CreateVacancyInput,
} from '../../lib/schemas/vacancy';
import type { DbExecutor } from '../../server/db';
import * as schema from '../../server/db/schema';
import { createVacancy, getVacancyDetail } from '../../server/services/vacancy';
import {
  addPosition,
  addUser,
  contextFor,
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

/** The concurrent suite commits its own fixtures on purpose (events keep a foreign key to their vertical), so leftover rows in the disposable database are intentional. */
const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 8, prepare: false });
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

const roles = () => rolesOf(world);
const key = () => randomUUID();
const publish = (overrides: Record<string, unknown> = {}): CreateVacancyInput =>
  ({
    mode: 'PUBLISH',
    verticalId: world.verticals.v1,
    positionId: world.positions.p1,
    title: 'Медіабаєр — Facebook',
    ...overrides,
  }) as CreateVacancyInput;
const draft = (overrides: Record<string, unknown> = {}): CreateVacancyInput =>
  ({
    mode: 'DRAFT',
    verticalId: world.verticals.v1,
    title: 'Чернетка — TikTok',
    ...overrides,
  }) as CreateVacancyInput;

const row = async (executor: DbExecutor, id: string) =>
  (
    await executor
      .select()
      .from(schema.vacancy)
      .where(eq(schema.vacancy.id, id))
  )[0];
const eventsOf = (executor: DbExecutor, id: string) =>
  executor
    .select({
      type: schema.entityEvent.type,
      subjectType: schema.entityEvent.subjectType,
      verticalId: schema.entityEvent.verticalId,
      vacancyId: schema.entityEvent.vacancyId,
      actorId: schema.entityEvent.actorId,
      payload: schema.entityEvent.payload,
    })
    .from(schema.entityEvent)
    .where(eq(schema.entityEvent.vacancyId, id))
    .orderBy(schema.entityEvent.id);
const auditsOf = (executor: DbExecutor, id: string) =>
  executor
    .select({
      action: schema.auditLog.action,
      actorId: schema.auditLog.actorId,
      after: schema.auditLog.after,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entityId, id));
const assignmentsOf = (executor: DbExecutor, id: string) =>
  executor
    .select({
      userId: schema.vacancyRecruiter.userId,
      assignedBy: schema.vacancyRecruiter.assignedBy,
    })
    .from(schema.vacancyRecruiter)
    .where(eq(schema.vacancyRecruiter.vacancyId, id));
const keysOf = (executor: DbExecutor, userId: string) =>
  executor
    .select({ id: schema.idempotencyKey.id })
    .from(schema.idempotencyKey)
    .where(eq(schema.idempotencyKey.userId, userId));

describe('Create an OPEN vacancy [STORY-VAC-01-1 AC1, AC2, AC4, VAC-01, VAC-07]', () => {
  it('a Recruiter creates a recruiter-initiated vacancy: OPEN now, probation 90, themselves assigned, events and audit written', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().recruiter);
      const created = await createVacancy(
        ctx,
        publish({ headcount: 2, priority: 'URGENT', seniority: 'Мідл' }),
        key(),
      );
      expect(created).toMatchObject({
        title: 'Медіабаєр — Facebook',
        status: 'OPEN',
        priority: 'URGENT',
        source: 'APP',
        headcount: 2,
        probationDays: 90,
        recruiterInitiated: true,
        teamLead: null,
        seniority: 'Мідл',
        openedAt: NOW.toISOString(),
        version: 1,
        vertical: { id: world.verticals.v1 },
        position: { id: world.positions.p1 },
        recruiters: [{ id: s.actorId }],
      });
      expect(created.number).toMatch(/^V-\d{4,}$/);
      const stored = await row(s.tx, created.id);
      expect(stored).toMatchObject({
        createdBy: s.actorId,
        createdAt: NOW,
        updatedAt: NOW,
        closedAt: null,
        cancelledAt: null,
        deletedAt: null,
        teamLeadId: null,
        recruiterInitiated: true,
      });
      expect(await assignmentsOf(s.tx, created.id)).toEqual([
        { userId: s.actorId, assignedBy: s.actorId },
      ]);
      const events = await eventsOf(s.tx, created.id);
      expect(events.map((e) => e.type)).toEqual([
        'vacancy.created',
        'vacancy.recruiter_assigned',
      ]);
      expect(events[0]).toMatchObject({
        subjectType: 'vacancy',
        verticalId: world.verticals.v1,
        actorId: s.actorId,
        payload: {
          v: 1,
          number: String(BigInt(created.number.slice(2))),
          status: 'OPEN',
          source: 'APP',
          recruiterInitiated: true,
        },
      });
      expect(events[1]!.payload).toEqual({ v: 1, userId: s.actorId });
      expect(await auditsOf(s.tx, created.id)).toMatchObject([
        {
          action: 'vacancy.created',
          actorId: s.actorId,
          after: {
            number: created.number,
            status: 'OPEN',
            recruiterInitiated: true,
          },
        },
      ]);
    });
  });

  it('a Head Recruiter picks an active Team Lead of the vertical: not recruiter-initiated, creator not assigned', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, {
        roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
        name: 'Василь Тімлід',
      });
      const created = await createVacancy(
        await s.as(roles().head),
        publish({ teamLeadId: lead }),
        key(),
      );
      expect(created).toMatchObject({
        status: 'OPEN',
        recruiterInitiated: false,
        teamLead: { id: lead, fullName: 'Василь Тімлід', isActive: true },
        recruiters: [],
      });
      expect(await assignmentsOf(s.tx, created.id)).toEqual([]);
      expect(
        (await eventsOf(s.tx, created.id)).map((event) => event.type),
      ).toEqual(['vacancy.created']);
    });
  });

  it('a Head Recruiter without a Team Lead also creates a recruiter-initiated vacancy', async () => {
    await scenario(async (s) => {
      const created = await createVacancy(
        await s.as(roles().head),
        publish({ teamLeadId: null }),
        key(),
      );
      expect(created).toMatchObject({
        recruiterInitiated: true,
        teamLead: null,
      });
    });
  });

  it('an Admin creates in any vertical and is the only author who may set the probation length [D78]', async () => {
    await scenario(async (s) => {
      const created = await createVacancy(
        await s.as(roles().admin),
        publish({
          verticalId: world.verticals.v2,
          positionId: world.positions.p2,
          probationDays: 45,
          salaryMinMinor: '4000000',
          salaryMaxMinor: '6000000',
          salaryCurrency: 'UAH',
          workFormat: 'HYBRID',
          location: 'Київ',
          employmentType: 'Повна зайнятість',
        }),
        key(),
      );
      expect(created).toMatchObject({
        probationDays: 45,
        vertical: { id: world.verticals.v2 },
        salaryMinMinor: '4000000',
        salaryMaxMinor: '6000000',
        salaryCurrency: 'UAH',
        workFormat: 'HYBRID',
        location: 'Київ',
        recruiters: [],
      });
    });
  });

  it('stores the rich-text description and requirements without exposing them in the card yet', async () => {
    await scenario(async (s) => {
      const doc = {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Опис' }] },
        ],
      };
      const created = await createVacancy(
        await s.as(roles().head),
        publish({ descriptionDoc: doc, requirementsDoc: doc }),
        key(),
      );
      expect(created).not.toHaveProperty('descriptionDoc');
      expect(await row(s.tx, created.id)).toMatchObject({
        descriptionDoc: doc,
        requirementsDoc: doc,
      });
    });
  });

  it('hands out increasing numbers, never reusing one after a refused creation', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head);
      const first = await createVacancy(ctx, publish(), key());
      await problem(
        createVacancy(ctx, publish({ positionId: world.positions.p2 }), key()),
      );
      const second = await createVacancy(ctx, publish(), key());
      expect(BigInt(second.number.slice(2))).toBeGreaterThan(
        BigInt(first.number.slice(2)),
      );
    });
  });

  it('opens at the moment of creation, stored in UTC', async () => {
    await scenario(async (s) => {
      const late = new Date('2026-11-09T23:30:00Z');
      const created = await createVacancy(
        await s.as(roles().head, { now: late }),
        publish(),
        key(),
      );
      expect(created.openedAt).toBe('2026-11-09T23:30:00.000Z');
      expect((await row(s.tx, created.id))!.openedAt).toEqual(late);
    });
  });
});

describe('Save a draft [STORY-VAC-01-1 AC3, D89, D92]', () => {
  it('saves a DRAFT with only vertical and title: no opening date, no position, no audit row, author-only events', async () => {
    await scenario(async (s) => {
      const created = await createVacancy(
        await s.as(roles().recruiter),
        draft(),
        key(),
      );
      expect(created).toMatchObject({
        status: 'DRAFT',
        title: 'Чернетка — TikTok',
        openedAt: null,
        position: null,
        headcount: 1,
        probationDays: 90,
        recruiterInitiated: true,
        recruiters: [{ id: s.actorId }],
      });
      expect(await row(s.tx, created.id)).toMatchObject({
        openedAt: null,
        closedAt: null,
        cancelledAt: null,
        positionId: null,
      });
      expect(await auditsOf(s.tx, created.id)).toEqual([]);
      const events = await eventsOf(s.tx, created.id);
      expect(events.map((e) => e.type)).toEqual([
        'vacancy.created',
        'vacancy.recruiter_assigned',
      ]);
      expect(events[0]!.payload).toMatchObject({ status: 'DRAFT' });
    });
  });

  it('keeps the same rules for who may author: a Head Recruiter draft names no assignment, an Admin draft is theirs', async () => {
    await scenario(async (s) => {
      const byHead = await createVacancy(
        await s.as(roles().head),
        draft(),
        key(),
      );
      expect(byHead.recruiters).toEqual([]);
      expect(await auditsOf(s.tx, byHead.id)).toEqual([]);
      const byAdmin = await createVacancy(
        await s.as(roles().admin),
        draft(),
        key(),
      );
      expect(byAdmin.status).toBe('DRAFT');
    });
  });

  it('still validates a position that is chosen on a draft', async () => {
    await scenario(async (s) => {
      const inactive = await addPosition(s.tx, world.verticals.v1, s.actorId, {
        active: false,
      });
      expect(
        await problem(
          createVacancy(
            await s.as(roles().head),
            draft({ positionId: inactive }),
            key(),
          ),
        ),
      ).toMatchObject({ status: 409, code: 'POSITION_INACTIVE' });
      expect(
        (
          await createVacancy(
            await s.as(roles().head),
            draft({ positionId: world.positions.p1 }),
            key(),
          )
        ).position,
      ).toMatchObject({ id: world.positions.p1 });
    });
  });
});

describe('Who may create [STORY-VAC-01-1 AC5, AC7, D77, D87, D89]', () => {
  type Outcome = 'ok' | 401 | 403 | 404;
  const outcome = async (run: Promise<unknown>): Promise<Outcome> => {
    try {
      await run;
      return 'ok';
    } catch (error) {
      const refused = await problem(Promise.reject(error));
      return refused.status as Outcome;
    }
  };
  const table: [string, keyof ReturnType<typeof roles>, Outcome, Outcome][] = [
    // role, own vertical (v1), foreign vertical (v2)
    ['Admin', 'admin', 'ok', 'ok'],
    ['Head Recruiter', 'head', 'ok', 404],
    ['Recruiter', 'recruiter', 'ok', 404],
    ['Team Lead (request form only)', 'teamLead', 403, 404],
    ['Team Lead who is also a Recruiter', 'teamLeadAndRecruiter', 'ok', 404],
    ['Head HR', 'headHr', 403, 403],
    ['HR', 'hr', 403, 403],
    ['Finance', 'finance', 404, 404],
    ['no role', 'none', 404, 404],
  ];

  it.each(table)(
    '%s: own vertical %s, foreign vertical %s',
    async (_name, who, own, foreign) => {
      await scenario(async (s) => {
        const ctx = await s.as(roles()[who]);
        expect(await outcome(createVacancy(ctx, draft(), key()))).toBe(own);
        expect(await outcome(createVacancy(ctx, publish(), key()))).toBe(own);
        expect(
          await outcome(
            createVacancy(
              ctx,
              publish({
                verticalId: world.verticals.v2,
                positionId: world.positions.p2,
              }),
              key(),
            ),
          ),
        ).toBe(foreign);
      });
    },
  );

  it('answers 401 MFA_REQUIRED to an Admin who has not passed the second factor', async () => {
    await scenario(async (s) => {
      expect(
        await problem(
          createVacancy(
            await s.as(roles().admin, { aal: 'aal1' }),
            publish(),
            key(),
          ),
        ),
      ).toMatchObject({ status: 401, code: 'MFA_REQUIRED' });
    });
  });

  it('writes nothing when a role is refused', async () => {
    await scenario(async (s) => {
      const before = await s.tx.select().from(schema.vacancy);
      for (const who of ['teamLead', 'hr', 'headHr', 'finance'] as const)
        await problem(
          createVacancy(await s.as(roles()[who]), publish(), key()),
        );
      expect(await s.tx.select().from(schema.vacancy)).toHaveLength(
        before.length,
      );
      expect(await keysOf(s.tx, s.actorId)).toEqual([]);
    });
  });

  it('refuses fields a role may not set instead of ignoring them', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, {
        roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
      });
      const refused = async (
        who: keyof ReturnType<typeof roles>,
        extra: Record<string, unknown>,
      ) =>
        problem(createVacancy(await s.as(roles()[who]), publish(extra), key()));
      expect(await refused('recruiter', { teamLeadId: lead })).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
      });
      expect(await refused('recruiter', { probationDays: 60 })).toMatchObject({
        status: 403,
      });
      expect(await refused('head', { probationDays: 90 })).toMatchObject({
        status: 403,
      });
      expect(
        await refused('teamLeadAndRecruiter', { teamLeadId: lead }),
      ).toMatchObject({ status: 403 });
    });
  });

  it('gives a vertical-bound author no rights over another vertical through a second role elsewhere', async () => {
    await scenario(async (s) => {
      const ctx = await s.as([
        { role: 'HEAD_RECRUITER', verticalId: world.verticals.v1 },
        { role: 'RECRUITER', verticalId: world.verticals.v2 },
      ]);
      const inV2 = await createVacancy(
        ctx,
        publish({
          verticalId: world.verticals.v2,
          positionId: world.positions.p2,
        }),
        key(),
      );
      expect(inV2.recruiters).toMatchObject([{ id: s.actorId }]);
      await expect(
        problem(
          createVacancy(
            ctx,
            publish({
              verticalId: world.verticals.v2,
              positionId: world.positions.p2,
              probationDays: 60,
            }),
            key(),
          ),
        ),
      ).resolves.toMatchObject({ status: 403 });
    });
  });
});

describe('Position and Team Lead validation [STORY-VAC-01-1 AC7, ADR-013]', () => {
  const writes = async (s: { tx: DbExecutor }) =>
    (await s.tx.select().from(schema.vacancy)).length;

  it('refuses a position of another vertical or an unknown one with a field error, without telling which', async () => {
    await scenario(async (s) => {
      const before = await writes(s);
      for (const positionId of [world.positions.p2, randomUUID()])
        expect(
          await problem(
            createVacancy(
              await s.as(roles().head),
              publish({ positionId }),
              key(),
            ),
          ),
        ).toEqual({
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ path: 'body.positionId', code: 'invalid_position' }],
        });
      expect(await writes(s)).toBe(before);
    });
  });

  it('refuses an inactive position with 409 POSITION_INACTIVE and keeps the key free for a retry', async () => {
    await scenario(async (s) => {
      const inactive = await addPosition(s.tx, world.verticals.v1, s.actorId, {
        active: false,
      });
      const retryKey = key();
      const ctx = await s.as(roles().recruiter);
      const before = await writes(s);
      expect(
        await problem(
          createVacancy(ctx, publish({ positionId: inactive }), retryKey),
        ),
      ).toEqual({
        status: 409,
        code: 'POSITION_INACTIVE',
        errors: [{ path: 'body.positionId', code: 'position_inactive' }],
      });
      expect(await writes(s)).toBe(before);
      expect(await keysOf(s.tx, s.actorId)).toEqual([]);
      await s.tx
        .update(schema.position)
        .set({ isActive: true })
        .where(eq(schema.position.id, inactive));
      expect(
        (await createVacancy(ctx, publish({ positionId: inactive }), retryKey))
          .status,
      ).toBe('OPEN');
    });
  });

  it('keeps a vacancy of an already deactivated position working after the fact (deactivation is not retroactive)', async () => {
    await scenario(async (s) => {
      const extra = await addPosition(s.tx, world.verticals.v1, s.actorId);
      const created = await createVacancy(
        await s.as(roles().head),
        publish({ positionId: extra }),
        key(),
      );
      await s.tx
        .update(schema.position)
        .set({ isActive: false })
        .where(eq(schema.position.id, extra));
      expect(
        (await getVacancyDetail(await s.as(roles().head), created.id)).position,
      ).toMatchObject({ id: extra });
    });
  });

  it('accepts only an active Team Lead holding the role in this vertical', async () => {
    await scenario(async (s) => {
      const { v1, v2 } = world.verticals;
      const candidates = {
        otherVertical: await addUser(s.tx, {
          roles: [{ role: 'TEAM_LEAD', verticalId: v2 }],
        }),
        deactivated: await addUser(s.tx, {
          roles: [{ role: 'TEAM_LEAD', verticalId: v1 }],
          active: false,
        }),
        recruiterOnly: await addUser(s.tx, {
          roles: [{ role: 'RECRUITER', verticalId: v1 }],
        }),
        noRoles: await addUser(s.tx),
        unknown: randomUUID(),
      };
      const before = await writes(s);
      for (const [name, teamLeadId] of Object.entries(candidates))
        expect(
          await problem(
            createVacancy(
              await s.as(roles().head),
              publish({ teamLeadId }),
              key(),
            ),
          ),
          name,
        ).toEqual({
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ path: 'body.teamLeadId', code: 'invalid_team_lead' }],
        });
      expect(await writes(s)).toBe(before);
    });
  });

  it('rejects out-of-range probation and bad salary at the contract, before anything is written', async () => {
    await scenario(async (s) => {
      const before = await writes(s);
      for (const bad of [
        { probationDays: 29 },
        { probationDays: 91 },
        { headcount: 0 },
        { salaryMinMinor: '10' },
        {
          salaryMinMinor: '10',
          salaryMaxMinor: '5',
          salaryCurrency: 'USD',
        },
        { title: '  ' },
      ])
        await expect(
          createVacancy(await s.as(roles().admin), publish(bad), key()),
        ).rejects.toThrow();
      expect(await writes(s)).toBe(before);
    });
  });

  it('is rejected by the database when a service bug would skip the check: probation 29 and 91', async () => {
    await scenario(async (s) => {
      for (const probationDays of [29, 91])
        await expect(
          s.tx.insert(schema.vacancy).values({
            verticalId: world.verticals.v1,
            positionId: world.positions.p1,
            title: 'Перевірка обмежень',
            status: 'OPEN',
            probationDays,
            openedAt: NOW,
            createdBy: s.actorId,
            teamLeadId: null,
            recruiterInitiated: true,
          }),
        ).rejects.toThrow();
    });
  });
});

describe('Idempotent creation [STORY-VAC-01-1 AC6]', () => {
  it('replays the same key and body as the same vacancy, once in the table, once in the history', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().recruiter);
      const replayKey = key();
      const first = await createVacancy(ctx, publish(), replayKey);
      const second = await createVacancy(ctx, publish(), replayKey);
      expect(second).toEqual(first);
      const mine = await s.tx
        .select({ id: schema.vacancy.id })
        .from(schema.vacancy)
        .where(eq(schema.vacancy.createdBy, s.actorId));
      expect(mine).toHaveLength(1);
      expect(await eventsOf(s.tx, first.id)).toHaveLength(2);
      expect(await auditsOf(s.tx, first.id)).toHaveLength(1);
      expect(await keysOf(s.tx, s.actorId)).toHaveLength(1);
    });
  });

  it('answers 409 IDEMPOTENCY_KEY_REUSED when the key comes back with another body and creates nothing', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head);
      const reused = key();
      await createVacancy(ctx, publish({ headcount: 1 }), reused);
      expect(
        await problem(createVacancy(ctx, publish({ headcount: 2 }), reused)),
      ).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(
        await s.tx
          .select({ id: schema.vacancy.id })
          .from(schema.vacancy)
          .where(eq(schema.vacancy.createdBy, s.actorId)),
      ).toHaveLength(1);
    });
  });

  it('treats a re-ordered but identical body as the same request', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head);
      const replayKey = key();
      const first = await createVacancy(
        ctx,
        publish({ headcount: 3, location: 'Київ' }),
        replayKey,
      );
      const again = await createVacancy(
        ctx,
        {
          location: 'Київ',
          headcount: 3,
          title: 'Медіабаєр — Facebook',
          positionId: world.positions.p1,
          verticalId: world.verticals.v1,
          mode: 'PUBLISH',
        },
        replayKey,
      );
      expect(again.id).toBe(first.id);
    });
  });

  it('gives deliberate repeats with new keys separate vacancies with separate numbers', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().head);
      const a = await createVacancy(ctx, publish(), key());
      const b = await createVacancy(ctx, publish(), key());
      expect(a.id).not.toBe(b.id);
      expect(a.number).not.toBe(b.number);
    });
  });

  it('scopes a key to its user: another author using the same key creates their own vacancy', async () => {
    await scenario(async (s) => {
      const sameKey = key();
      const mine = await createVacancy(
        await s.as(roles().head),
        publish(),
        sameKey,
      );
      const otherUser = await addUser(s.tx);
      const theirs = await createVacancy(
        await s.as(roles().head, { userId: otherUser }),
        publish(),
        sameKey,
      );
      expect(theirs.id).not.toBe(mine.id);
    });
  });

  it('lets a key be reused after a day', async () => {
    await scenario(async (s) => {
      const oldKey = key();
      const first = await createVacancy(
        await s.as(roles().head),
        publish(),
        oldKey,
      );
      const later = new Date(NOW.getTime() + IDEMPOTENCY_TTL_MS + 1000);
      const second = await createVacancy(
        await s.as(roles().head, { now: later }),
        publish(),
        oldKey,
      );
      expect(second.id).not.toBe(first.id);
      expect(await keysOf(s.tx, s.actorId)).toHaveLength(1);
    });
  });

  it('returns the draft again for its author, including a replay of a draft save', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().recruiter);
      const replayKey = key();
      const first = await createVacancy(ctx, draft(), replayKey);
      expect(await createVacancy(ctx, draft(), replayKey)).toEqual(first);
    });
  });
});

describe('Write throttle [STORY-VAC-01-1, SEC-CORE-09]', () => {
  it(`refuses the ${VACANCY_WRITE_RATE_LIMIT.perUser + 1}th write inside a minute with 429 and writes nothing for it`, async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().recruiter);
      for (let n = 0; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        await createVacancy(ctx, draft({ title: `Чернетка ${n}` }), key());
      expect(
        await problem(createVacancy(ctx, draft({ title: 'Зайва' }), key())),
      ).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
      expect(
        await s.tx
          .select({ id: schema.vacancy.id })
          .from(schema.vacancy)
          .where(
            and(
              eq(schema.vacancy.createdBy, s.actorId),
              eq(schema.vacancy.title, 'Зайва'),
            ),
          ),
      ).toEqual([]);
    });
  });
});

describe('Concurrent creation on committed rows [STORY-VAC-01-1 AC6, VAC-07]', () => {
  const db = () => drizzle(client, { schema });
  let fixture: {
    verticalId: string;
    positionId: string;
    authorId: string;
    roles: { role: string; verticalId: string | null }[];
  };

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const verticalId = randomUUID();
    const positionId = randomUUID();
    const authorId = randomUUID();
    const name = `Паралель ${suffix}`;
    await admin`insert into app.vertical (id, name) values (${verticalId}, ${`Світ ${name}`})`;
    await admin`insert into app.app_user (id, email, full_name) values (${authorId}, ${`${authorId}@fixture.test`}, 'Паралельний автор')`;
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${authorId}, 'HEAD_RECRUITER', ${verticalId})`;
    await admin`insert into app.position (id, vertical_id, name, name_key, created_by)
      values (${positionId}, ${verticalId}, ${name}, ${positionNameKey(name)}, ${authorId})`;
    fixture = {
      verticalId,
      positionId,
      authorId,
      roles: [{ role: 'HEAD_RECRUITER', verticalId }],
    };
  });

  const input = (extra: Record<string, unknown> = {}) =>
    ({
      mode: 'PUBLISH',
      verticalId: fixture.verticalId,
      positionId: fixture.positionId,
      title: 'Паралельна вакансія',
      ...extra,
    }) as CreateVacancyInput;
  const ctx = () => contextFor(db(), fixture.authorId, fixture.roles);

  it('five simultaneous requests with one key create exactly one vacancy and all return it', async () => {
    const sharedKey = key();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        createVacancy(ctx(), input({ title: 'Один ключ' }), sharedKey),
      ),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const stored = await admin`select count(*)::int as n from app.vacancy
      where created_by = ${fixture.authorId} and title = 'Один ключ'`;
    expect(stored[0]!.n).toBe(1);
    const events = await admin`select count(*)::int as n from app.entity_event
      where vacancy_id = ${results[0]!.id} and type = 'vacancy.created'`;
    expect(events[0]!.n).toBe(1);
  });

  it('simultaneous creations with different keys get distinct, never reused numbers', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, n) =>
        createVacancy(ctx(), input({ title: `Паралельна ${n}` }), key()),
      ),
    );
    expect(new Set(results.map((r) => r.number)).size).toBe(8);
    const rows =
      await admin`select id from app.vacancy where id in ${admin(results.map((r) => r.id))}`;
    expect(rows).toHaveLength(8);
  });

  it('a key racing with a different body yields one winner and 409 for the rest', async () => {
    const racing = key();
    const settled = await Promise.allSettled(
      [1, 2, 3, 4].map((headcount) =>
        createVacancy(ctx(), input({ title: 'Гонка', headcount }), racing),
      ),
    );
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const failure of settled.filter((r) => r.status === 'rejected'))
      expect(await problem(Promise.reject(failure.reason))).toMatchObject({
        status: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
  });

  it('a Team Lead deactivated first is refused, never attached to a new vacancy', async () => {
    const leadId = randomUUID();
    await admin`insert into app.app_user (id, email, full_name) values (${leadId}, ${`${leadId}@fixture.test`}, 'Тімлід')`;
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${leadId}, 'TEAM_LEAD', ${fixture.verticalId})`;
    await admin`update app.app_user set is_active = false, deactivated_at = now() where id = ${leadId}`;
    expect(
      await problem(createVacancy(ctx(), input({ teamLeadId: leadId }), key())),
    ).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    const stored =
      await admin`select count(*)::int as n from app.vacancy where team_lead_id = ${leadId}`;
    expect(stored[0]!.n).toBe(0);
  });

  /** A connection of its own: `admin` is held by the lock session while the creation waits. */
  const probe = connectTestDatabase(urls.migration);
  afterAll(async () => {
    await probe.end();
  });

  /** Polls the server for the creation statement queued behind the lock, instead of guessing with sleeps. */
  async function waitForLockWait() {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const waiting = await probe`select 1 from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
          and state = 'active' and query ilike '%for share%'`;
      if (waiting.length > 0) return;
      if (Date.now() > deadline)
        throw new Error('The creation never queued behind the lock');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  /** Runs `change` in a session holding `FOR NO KEY UPDATE` on the user, starts `create` once it holds it, and commits only after the create is queued behind the lock. */
  async function raceWithLock<T>(
    userId: string,
    change: (tx: postgres.TransactionSql) => Promise<void>,
    create: () => Promise<T>,
  ): Promise<T> {
    let locked: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => {
      locked = resolve;
    });
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = admin.begin(async (tx) => {
      await tx`select id from app.app_user where id = ${userId} for no key update`;
      await change(tx);
      locked();
      await held;
    });
    await holding;
    const creating = create();
    await waitForLockWait();
    release();
    await session;
    return creating;
  }

  const newLead = async (name: string) => {
    const leadId = randomUUID();
    await admin`insert into app.app_user (id, email, full_name) values (${leadId}, ${`${leadId}@fixture.test`}, ${name})`;
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${leadId}, 'TEAM_LEAD', ${fixture.verticalId})`;
    return leadId;
  };
  const vacanciesLedBy = async (leadId: string) =>
    (
      await admin`select count(*)::int as n from app.vacancy where team_lead_id = ${leadId}`
    )[0]!.n;

  it('a creation queued behind an in-flight deactivation is refused once the lock is released', async () => {
    const leadId = await newLead('Тімлід 2');
    const refused = await raceWithLock(
      leadId,
      async (tx) => {
        await tx`update app.app_user set is_active = false, deactivated_at = now() where id = ${leadId}`;
      },
      () => problem(createVacancy(ctx(), input({ teamLeadId: leadId }), key())),
    );
    expect(refused).toMatchObject({ status: 400 });
    expect(await vacanciesLedBy(leadId)).toBe(0);
  });

  it('a creation queued behind an in-flight role removal is refused: the Team Lead role is read after the lock [SEC-VC-03]', async () => {
    const leadId = await newLead('Тімлід 3');
    const refused = await raceWithLock(
      leadId,
      async (tx) => {
        await tx`delete from app.user_role where user_id = ${leadId} and role = 'TEAM_LEAD'`;
      },
      () => problem(createVacancy(ctx(), input({ teamLeadId: leadId }), key())),
    );
    expect(refused).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'body.teamLeadId', code: 'invalid_team_lead' }],
    });
    expect(await vacanciesLedBy(leadId)).toBe(0);
  });

  it('a creation queued behind the removal of the creator own role is refused on fresh role rows [S1]', async () => {
    const authorId = randomUUID();
    await admin`insert into app.app_user (id, email, full_name) values (${authorId}, ${`${authorId}@fixture.test`}, 'Автор, що втрачає роль')`;
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${authorId}, 'HEAD_RECRUITER', ${fixture.verticalId})`;
    const stale = () => contextFor(db(), authorId, fixture.roles);
    const refused = await raceWithLock(
      authorId,
      async (tx) => {
        await tx`delete from app.user_role where user_id = ${authorId}`;
      },
      () =>
        problem(
          createVacancy(stale(), input({ title: 'Після втрати ролі' }), key()),
        ),
    );
    expect(refused).toMatchObject({ status: 404 });
    const stored =
      await admin`select count(*)::int as n from app.vacancy where created_by = ${authorId}`;
    expect(stored[0]!.n).toBe(0);
  });
});

describe('Vertical, limits and atomicity', () => {
  it('answers 404 for an Admin creating in a vertical that does not exist, for both modes [S2]', async () => {
    await scenario(async (s) => {
      const missing = randomUUID();
      for (const body of [
        publish({ verticalId: missing }),
        draft({ verticalId: missing }),
      ])
        expect(
          await problem(createVacancy(await s.as(roles().admin), body, key())),
        ).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });
  });

  it(`refuses the ${VACANCY_DRAFT_LIMIT + 1}th live draft with 409 DRAFT_LIMIT_REACHED while publishing stays possible [SEC-VC-01]`, async () => {
    await scenario(async (s) => {
      // One minute apart, so the per-minute throttle never decides the outcome.
      const at = (n: number) => new Date(NOW.getTime() + n * 60_000);
      for (let n = 0; n < VACANCY_DRAFT_LIMIT; n += 1)
        await createVacancy(
          await s.as(roles().recruiter, { now: at(n) }),
          draft({ title: `Чернетка ${n}` }),
          key(),
        );
      expect(
        await problem(
          createVacancy(
            await s.as(roles().recruiter, { now: at(VACANCY_DRAFT_LIMIT) }),
            draft({ title: 'Зайва' }),
            key(),
          ),
        ),
      ).toMatchObject({ status: 409, code: 'DRAFT_LIMIT_REACHED' });
      expect(
        (
          await createVacancy(
            await s.as(roles().recruiter, { now: at(VACANCY_DRAFT_LIMIT + 1) }),
            publish({ title: 'Опублікована' }),
            key(),
          )
        ).status,
      ).toBe('OPEN');
      const stored = await s.tx
        .select({ id: schema.vacancy.id })
        .from(schema.vacancy)
        .where(
          and(
            eq(schema.vacancy.createdBy, s.actorId),
            eq(schema.vacancy.status, 'DRAFT'),
          ),
        );
      expect(stored).toHaveLength(VACANCY_DRAFT_LIMIT);
    });
  });

  it(`refuses the ${VACANCY_DAILY_CREATE_LIMIT.perUser + 1}th creation inside 24 hours with 429 even when each minute is quiet [SEC-VC-01]`, async () => {
    await scenario(async (s) => {
      const at = (n: number) => new Date(NOW.getTime() + n * 60_000);
      for (let n = 0; n < VACANCY_DAILY_CREATE_LIMIT.perUser; n += 1)
        await createVacancy(
          await s.as(roles().head, { now: at(n) }),
          publish({ title: `Вакансія ${n}` }),
          key(),
        );
      expect(
        await problem(
          createVacancy(
            await s.as(roles().head, {
              now: at(VACANCY_DAILY_CREATE_LIMIT.perUser),
            }),
            publish({ title: 'Зайва' }),
            key(),
          ),
        ),
      ).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
    });
  });

  it('rolls back the vacancy, assignment, events, audit and key together when a late statement fails [ADR-012]', async () => {
    await scenario(async (s) => {
      // A request id that is not a UUID fails the first event insert, after the vacancy and the assignment were written.
      const failing = {
        ...(await s.as(roles().recruiter)),
        requestId: 'not-a-uuid',
      };
      await expect(
        createVacancy(failing, publish({ title: 'Невдала' }), key()),
      ).rejects.toThrow();
      expect(
        await s.tx
          .select({ id: schema.vacancy.id })
          .from(schema.vacancy)
          .where(eq(schema.vacancy.createdBy, s.actorId)),
      ).toEqual([]);
      expect(
        await s.tx
          .select({ id: schema.vacancyRecruiter.vacancyId })
          .from(schema.vacancyRecruiter)
          .where(eq(schema.vacancyRecruiter.userId, s.actorId)),
      ).toEqual([]);
      expect(
        await s.tx
          .select({ id: schema.entityEvent.id })
          .from(schema.entityEvent)
          .where(eq(schema.entityEvent.actorId, s.actorId)),
      ).toEqual([]);
      expect(
        await s.tx
          .select({ id: schema.auditLog.id })
          .from(schema.auditLog)
          .where(eq(schema.auditLog.actorId, s.actorId)),
      ).toEqual([]);
      expect(await keysOf(s.tx, s.actorId)).toEqual([]);
    });
  });
});
