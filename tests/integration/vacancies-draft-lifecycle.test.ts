import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import {
  VACANCY_WRITE_RATE_LIMIT,
  type CreateVacancyInput,
  type PatchVacancyInput,
} from '../../lib/schemas/vacancy';
import { vacancyEventReadWhere } from '../../server/authz/vacancy-scope';
import type { RequestContext } from '../../server/context/request-context';
import type { DbExecutor } from '../../server/db';
import * as schema from '../../server/db/schema';
import { countLiveDrafts } from '../../server/repositories/vacancy';
import { listPositionCatalog } from '../../server/services/position';
import {
  createVacancy,
  getVacancyDetail,
  listVacancyPage,
} from '../../server/services/vacancy';
import {
  cancelVacancyDraft,
  deleteVacancyDraft,
  patchVacancyDraft,
  publishVacancyDraft,
} from '../../server/services/vacancy-draft';
import {
  addPosition,
  addUser,
  contextFor,
  createScenarioRunner,
  NOW,
  problem,
  rolesOf,
  type Roles,
} from '../support/vacancy-write-harness';
import { createLockRace } from '../support/lock-race';
import {
  createVacancyWorld,
  type VacancyWorld,
} from '../support/vacancy-world';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const probe = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 8, prepare: false });
let world: VacancyWorld;
let scenario: ReturnType<typeof createScenarioRunner>;

beforeAll(async () => {
  world = await createVacancyWorld(admin);
  scenario = createScenarioRunner(client);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), probe.end(), client.end()]);
});

const roles = () => rolesOf(world);
type Who = keyof ReturnType<typeof roles>;
const key = () => randomUUID();
const draft = (overrides: Record<string, unknown> = {}): CreateVacancyInput =>
  ({
    mode: 'DRAFT',
    verticalId: world.verticals.v1,
    title: 'Чернетка — TikTok',
    ...overrides,
  }) as CreateVacancyInput;
const complete = (overrides: Record<string, unknown> = {}) =>
  draft({ positionId: world.positions.p1, ...overrides });
const edit = (version: number, rest: Record<string, unknown>) =>
  ({ expectedVersion: version, ...rest }) as PatchVacancyInput;
const LATER = new Date(NOW.getTime() + 26 * 60 * 60 * 1000);

/** Publishes the draft at the version the author last saw unless the test names another. */
async function publish(
  ctx: RequestContext,
  id: string,
  publishKey: string = key(),
  expectedVersion?: number,
) {
  const stored =
    expectedVersion ??
    (
      await ctx.db
        .select({ version: schema.vacancy.version })
        .from(schema.vacancy)
        .where(eq(schema.vacancy.id, id))
    )[0]?.version ??
    1;
  return publishVacancyDraft(ctx, id, publishKey, { expectedVersion: stored });
}

const row = async (executor: DbExecutor, id: string) =>
  (
    await executor
      .select()
      .from(schema.vacancy)
      .where(eq(schema.vacancy.id, id))
  )[0]!;
const eventsOf = (executor: DbExecutor, id: string) =>
  executor
    .select({
      id: schema.entityEvent.id,
      type: schema.entityEvent.type,
      verticalId: schema.entityEvent.verticalId,
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
      before: schema.auditLog.before,
      after: schema.auditLog.after,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entityId, id));
const keysOf = (executor: DbExecutor, userId: string) =>
  executor
    .select({ id: schema.idempotencyKey.id })
    .from(schema.idempotencyKey)
    .where(eq(schema.idempotencyKey.userId, userId));

/** The author's draft, saved by a Recruiter unless `who` says otherwise. */
async function saveDraft(
  s: Parameters<Parameters<typeof scenario>[0]>[0],
  overrides: Record<string, unknown> = {},
  who: Who = 'recruiter',
) {
  return createVacancy(await s.as(roles()[who]), draft(overrides), key());
}

describe('Edit my draft [STORY-VAC-01-3 AC2, D92]', () => {
  it('saves a partial update on the merged draft: version up, updated_at touched, author events carry field names only', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      const ctx = await s.as(roles().recruiter, { now: LATER });
      const saved = await patchVacancyDraft(
        ctx,
        created.id,
        edit(created.version, {
          title: '  Медіабаєр — Facebook ',
          positionId: world.positions.p1,
          headcount: 3,
          salaryMinMinor: '4000000',
          salaryCurrency: 'UAH',
          location: 'Київ',
        }),
      );
      expect(saved).toMatchObject({
        status: 'DRAFT',
        title: 'Медіабаєр — Facebook',
        position: { id: world.positions.p1 },
        headcount: 3,
        salaryMinMinor: '4000000',
        salaryMaxMinor: null,
        salaryCurrency: 'UAH',
        location: 'Київ',
        version: created.version + 1,
        updatedAt: LATER.toISOString(),
        createdAt: created.createdAt,
        openedAt: null,
      });
      const events = await eventsOf(s.tx, created.id);
      expect(events.map((event) => event.type)).toEqual([
        'vacancy.created',
        'vacancy.recruiter_assigned',
        'vacancy.updated',
      ]);
      expect(events.every((event) => event.verticalId === null)).toBe(true);
      expect(events[2]).toMatchObject({
        actorId: s.actorId,
        payload: {
          v: 1,
          fields: ['title', 'positionId', 'headcount', 'location', 'salary'],
        },
      });
      expect(await auditsOf(s.tx, created.id)).toEqual([]);
      expect(await row(s.tx, created.id)).toMatchObject({
        createdBy: s.actorId,
        createdAt: NOW,
      });
    });
  });

  it('leaves a request that changes nothing unwritten and clears an optional field with null', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s, { location: 'Київ', headcount: 2 });
      const ctx = await s.as(roles().recruiter);
      const same = await patchVacancyDraft(
        ctx,
        created.id,
        edit(created.version, { title: created.title, location: 'Київ' }),
      );
      expect(same).toEqual(created);
      expect(await eventsOf(s.tx, created.id)).toHaveLength(2);
      const cleared = await patchVacancyDraft(
        ctx,
        created.id,
        edit(created.version, { location: null }),
      );
      expect(cleared).toMatchObject({
        location: null,
        headcount: 2,
        version: created.version + 1,
      });
    });
  });

  it('refuses a stale version with 409 STALE_STATE and saves nothing, then accepts the fresh one', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      const ctx = await s.as(roles().recruiter);
      const first = await patchVacancyDraft(
        ctx,
        created.id,
        edit(created.version, { title: 'Перша вкладка' }),
      );
      expect(
        await problem(
          patchVacancyDraft(
            ctx,
            created.id,
            edit(created.version, { title: 'Друга вкладка', headcount: 9 }),
          ),
        ),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
      expect(await row(s.tx, created.id)).toMatchObject({
        title: 'Перша вкладка',
        headcount: 1,
        version: first.version,
      });
      expect(
        (
          await patchVacancyDraft(
            ctx,
            created.id,
            edit(first.version, { title: 'Друга вкладка' }),
          )
        ).title,
      ).toBe('Друга вкладка');
    });
  });

  it('validates salary on the merged result: a bound needs the currency, min never exceeds max', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s, {
        salaryMinMinor: '100',
        salaryMaxMinor: '200',
        salaryCurrency: 'USD',
      });
      const ctx = await s.as(roles().recruiter);
      const refused = async (rest: Record<string, unknown>) =>
        problem(
          patchVacancyDraft(ctx, created.id, edit(created.version, rest)),
        );
      expect(await refused({ salaryMaxMinor: '50' })).toEqual({
        status: 400,
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'body.salaryMaxMinor', code: 'invalid_salary' }],
      });
      expect(await refused({ salaryCurrency: null })).toMatchObject({
        status: 400,
        errors: [{ path: 'body.salaryCurrency' }],
      });
      expect(
        await refused({
          salaryMinMinor: null,
          salaryMaxMinor: null,
          salaryCurrency: 'EUR',
        }),
      ).toMatchObject({ status: 400 });
      const cleared = await patchVacancyDraft(
        ctx,
        created.id,
        edit(created.version, {
          salaryMinMinor: null,
          salaryMaxMinor: null,
          salaryCurrency: null,
        }),
      );
      expect(cleared).toMatchObject({
        salaryMinMinor: null,
        salaryMaxMinor: null,
        salaryCurrency: null,
      });
      expect(await row(s.tx, created.id)).toMatchObject({ version: 2 });
    });
  });

  it('gates a changed Team Lead and probation length by their permissions and keeps recruiter_initiated in step', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, {
        roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
      });
      const created = await saveDraft(s, {}, 'head');
      const asHead = await s.as(roles().head);
      expect(created.recruiterInitiated).toBe(true);
      const led = await patchVacancyDraft(
        asHead,
        created.id,
        edit(created.version, { teamLeadId: lead }),
      );
      expect(led).toMatchObject({
        teamLead: { id: lead },
        recruiterInitiated: false,
        version: created.version + 1,
      });
      expect(
        await problem(
          patchVacancyDraft(
            asHead,
            created.id,
            edit(led.version, { probationDays: 60 }),
          ),
        ),
      ).toMatchObject({ status: 403, code: 'FORBIDDEN' });
      const unled = await patchVacancyDraft(
        asHead,
        created.id,
        edit(led.version, { teamLeadId: null, probationDays: 90 }),
      );
      expect(unled).toMatchObject({
        teamLead: null,
        recruiterInitiated: true,
        probationDays: 90,
      });
      const byAdmin = await s.as(roles().admin);
      const adminDraft = await createVacancy(byAdmin, draft(), key());
      expect(
        (
          await patchVacancyDraft(
            byAdmin,
            adminDraft.id,
            edit(adminDraft.version, { probationDays: 45 }),
          )
        ).probationDays,
      ).toBe(45);
    });
  });

  it('refuses a Team Lead change for a Recruiter and a Team Lead who is not eligible', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, {
        roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
      });
      const created = await saveDraft(s);
      expect(
        await problem(
          patchVacancyDraft(
            await s.as(roles().recruiter),
            created.id,
            edit(created.version, { teamLeadId: lead }),
          ),
        ),
      ).toMatchObject({ status: 403 });
      const headDraft = await saveDraft(s, {}, 'head');
      const asHead = await s.as(roles().head);
      for (const teamLeadId of [
        await addUser(s.tx, {
          roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v2 }],
        }),
        await addUser(s.tx, {
          roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
          active: false,
        }),
        randomUUID(),
      ])
        expect(
          await problem(
            patchVacancyDraft(
              asHead,
              headDraft.id,
              edit(headDraft.version, { teamLeadId }),
            ),
          ),
        ).toEqual({
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ path: 'body.teamLeadId', code: 'invalid_team_lead' }],
        });
    });
  });

  it('checks a newly chosen position: inactive is 409 POSITION_INACTIVE, another vertical or unknown is a field error', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      const ctx = await s.as(roles().recruiter);
      const inactive = await addPosition(s.tx, world.verticals.v1, s.actorId, {
        active: false,
      });
      expect(
        await problem(
          patchVacancyDraft(
            ctx,
            created.id,
            edit(created.version, { positionId: inactive }),
          ),
        ),
      ).toMatchObject({ status: 409, code: 'POSITION_INACTIVE' });
      for (const positionId of [world.positions.p2, randomUUID()])
        expect(
          await problem(
            patchVacancyDraft(
              ctx,
              created.id,
              edit(created.version, { positionId }),
            ),
          ),
        ).toEqual({
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ path: 'body.positionId', code: 'invalid_position' }],
        });
      expect((await row(s.tx, created.id)).version).toBe(created.version);
    });
  });

  it('does not touch the vertical, status, author or number: only a draft is editable', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      const stored = await row(s.tx, created.id);
      await patchVacancyDraft(
        await s.as(roles().recruiter),
        created.id,
        edit(created.version, { title: 'Нова назва' }),
      );
      expect(await row(s.tx, created.id)).toMatchObject({
        verticalId: stored.verticalId,
        createdBy: stored.createdBy,
        createdAt: stored.createdAt,
        publicNo: stored.publicNo,
        status: 'DRAFT',
        source: 'APP',
      });
    });
  });
});

describe('Publish my draft [STORY-VAC-01-3 AC3, AC6, AC7, VAC-02, D92]', () => {
  it('opens at the publish moment with the audit trail of the author, one status event, counters +1 and the key stored', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s, { positionId: world.positions.p1 });
      const count = async () =>
        (
          await listPositionCatalog(await s.as(roles().admin), {
            status: 'all',
          })
        ).items.find((item) => item.id === world.positions.p1)!
          .openVacanciesCount;
      const before = await count();
      const ctx = await s.as(roles().recruiter, { now: LATER });
      const publishKey = key();
      const opened = await publish(ctx, created.id, publishKey);
      expect(opened).toMatchObject({
        status: 'OPEN',
        openedAt: LATER.toISOString(),
        createdAt: NOW.toISOString(),
        updatedAt: LATER.toISOString(),
        version: created.version + 1,
        recruiters: [{ id: s.actorId }],
      });
      expect(await row(s.tx, created.id)).toMatchObject({
        openedAt: LATER,
        closedAt: null,
        cancelledAt: null,
        createdBy: s.actorId,
      });
      expect(await count()).toBe(before! + 1);
      const events = await eventsOf(s.tx, created.id);
      expect(events.map((event) => event.type)).toEqual([
        'vacancy.created',
        'vacancy.recruiter_assigned',
        'vacancy.status_changed',
      ]);
      expect(events[2]).toMatchObject({
        verticalId: world.verticals.v1,
        actorId: s.actorId,
        payload: { v: 1, from: 'DRAFT', to: 'OPEN' },
      });
      expect(await auditsOf(s.tx, created.id)).toMatchObject([
        {
          action: 'vacancy.created',
          actorId: s.actorId,
          before: { status: 'DRAFT' },
          after: {
            number: created.number,
            status: 'OPEN',
            title: created.title,
            createdBy: s.actorId,
            createdAt: NOW.toISOString(),
            publishedFromDraft: true,
          },
        },
      ]);
      expect(await keysOf(s.tx, s.actorId)).toHaveLength(2);
    });
  });

  it('shows the published vacancy to the vertical at once and an unassigned one to every recruiter', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(
        s,
        { positionId: world.positions.p1 },
        'head',
      );
      await publish(await s.as(roles().head), created.id, key());
      const other = await addUser(s.tx);
      for (const who of ['recruiter', 'head', 'admin'] as const) {
        const seen = await getVacancyDetail(
          await s.as(roles()[who], { userId: other }),
          created.id,
        );
        expect(seen).toMatchObject({ status: 'OPEN', recruiters: [] });
      }
      expect(
        (
          await listVacancyPage(
            await s.as(roles().recruiter, { userId: other }),
            {
              limit: 100,
            },
          )
        ).items.map((item) => item.id),
      ).toContain(created.id);
    });
  });

  it('returns the first result for a repeated key, writes once, and refuses the key for another draft or body', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().recruiter);
      const a = await saveDraft(s, { positionId: world.positions.p1 });
      const b = await saveDraft(s, { positionId: world.positions.p1 });
      const publishKey = key();
      const first = await publish(ctx, a.id, publishKey, a.version);
      expect(await publish(ctx, a.id, publishKey, a.version)).toEqual(first);
      expect(
        (await eventsOf(s.tx, a.id)).filter(
          (event) => event.type === 'vacancy.status_changed',
        ),
      ).toHaveLength(1);
      expect(await auditsOf(s.tx, a.id)).toHaveLength(1);
      expect(
        await problem(publish(ctx, b.id, publishKey, b.version)),
      ).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
      expect(
        await problem(publish(ctx, a.id, publishKey, a.version + 1)),
        'the version is part of the request',
      ).toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
      expect((await row(s.tx, b.id)).status).toBe('DRAFT');
    });
  });

  it('gives a second publish with another key 409 VACANCY_NOT_DRAFT and no second transition', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s, { positionId: world.positions.p1 });
      const ctx = await s.as(roles().recruiter);
      await publish(ctx, created.id, key());
      expect(await problem(publish(ctx, created.id, key()))).toMatchObject({
        status: 409,
        code: 'VACANCY_NOT_DRAFT',
      });
      expect(
        (await eventsOf(s.tx, created.id)).filter(
          (event) => event.type === 'vacancy.status_changed',
        ),
      ).toHaveLength(1);
      expect(await auditsOf(s.tx, created.id)).toHaveLength(1);
    });
  });

  it('publishes only the version the author last saw: a stale one is 409 STALE_STATE, nothing opens and the key stays free', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s, { positionId: world.positions.p1 });
      const ctx = await s.as(roles().recruiter);
      const edited = await patchVacancyDraft(
        ctx,
        created.id,
        edit(created.version, { headcount: 3 }),
      );
      const retryKey = key();
      expect(
        await problem(publish(ctx, created.id, retryKey, created.version)),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
      expect(await row(s.tx, created.id)).toMatchObject({
        status: 'DRAFT',
        openedAt: null,
      });
      expect(await keysOf(s.tx, s.actorId)).toHaveLength(1);
      expect(
        (await publish(ctx, created.id, retryKey, edited.version)).status,
      ).toBe('OPEN');
    });
  });

  it('refuses editing, cancelling and deleting once it is published', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s, { positionId: world.positions.p1 });
      const ctx = await s.as(roles().recruiter);
      const opened = await publish(ctx, created.id, key());
      const refused = [
        () =>
          patchVacancyDraft(
            ctx,
            created.id,
            edit(opened.version, { title: 'Пізно' }),
          ),
        () => cancelVacancyDraft(ctx, created.id, { reason: 'Пізно' }),
        () => deleteVacancyDraft(ctx, created.id),
      ];
      for (const attempt of refused)
        expect(await problem(attempt())).toMatchObject({
          status: 409,
          code: 'VACANCY_NOT_DRAFT',
        });
      expect(await row(s.tx, created.id)).toMatchObject({
        status: 'OPEN',
        title: created.title,
        deletedAt: null,
      });
    });
  });

  it('needs a position: 400 body.positionId required, the draft and the key stay free', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      const ctx = await s.as(roles().recruiter);
      const retryKey = key();
      expect(await problem(publish(ctx, created.id, retryKey))).toEqual({
        status: 400,
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'body.positionId', code: 'required' }],
      });
      expect(await keysOf(s.tx, s.actorId)).toHaveLength(1);
      const completed = await patchVacancyDraft(
        ctx,
        created.id,
        edit(created.version, { positionId: world.positions.p1 }),
      );
      expect((await publish(ctx, completed.id, retryKey)).status).toBe('OPEN');
    });
  });

  it('is refused when the position was deactivated after the save, and works again once it is active [AC4]', async () => {
    await scenario(async (s) => {
      const position = await addPosition(s.tx, world.verticals.v1, s.actorId);
      const created = await saveDraft(s, { positionId: position });
      await s.tx
        .update(schema.position)
        .set({ isActive: false })
        .where(eq(schema.position.id, position));
      const ctx = await s.as(roles().recruiter);
      expect(await problem(publish(ctx, created.id, key()))).toMatchObject({
        status: 409,
        code: 'POSITION_INACTIVE',
      });
      expect(await row(s.tx, created.id)).toMatchObject({
        status: 'DRAFT',
        openedAt: null,
      });
      await s.tx
        .update(schema.position)
        .set({ isActive: true })
        .where(eq(schema.position.id, position));
      expect((await publish(ctx, created.id, key())).status).toBe('OPEN');
    });
  });

  it('is refused when the Team Lead was deactivated or lost the role after the save [AC4, SEC-VC-07]', async () => {
    await scenario(async (s) => {
      for (const change of ['deactivated', 'role removed'] as const) {
        const lead = await addUser(s.tx, {
          roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
        });
        const created = await saveDraft(
          s,
          { positionId: world.positions.p1, teamLeadId: lead },
          'head',
        );
        if (change === 'deactivated')
          await s.tx
            .update(schema.appUser)
            .set({ isActive: false, deactivatedAt: NOW })
            .where(eq(schema.appUser.id, lead));
        else
          await s.tx
            .delete(schema.userRole)
            .where(eq(schema.userRole.userId, lead));
        expect(
          await problem(publish(await s.as(roles().head), created.id, key())),
          change,
        ).toEqual({
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ path: 'body.teamLeadId', code: 'invalid_team_lead' }],
        });
        expect((await row(s.tx, created.id)).status).toBe('DRAFT');
      }
    });
  });

  it('re-checks the author: a lost Team Lead permission is 403, a lost authoring role or vertical is 404, and the draft stays theirs [D98]', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, {
        roles: [{ role: 'TEAM_LEAD', verticalId: world.verticals.v1 }],
      });
      const created = await saveDraft(
        s,
        { positionId: world.positions.p1, teamLeadId: lead },
        'head',
      );
      const downgraded = await s.as(roles().recruiter);
      expect(
        await problem(publish(downgraded, created.id, key())),
      ).toMatchObject({ status: 403 });
      for (const lost of ['none', 'recruiterOther', 'teamLead'] as const)
        expect(
          await problem(publish(await s.as(roles()[lost]), created.id, key())),
          lost,
        ).toMatchObject({ status: 404 });
      expect(await row(s.tx, created.id)).toMatchObject({
        status: 'DRAFT',
        createdBy: s.actorId,
      });
      expect(
        (await publish(await s.as(roles().head), created.id, key())).status,
      ).toBe('OPEN');
    });
  });

  it('keeps the probation length gate: a draft saved with a non-default length needs the permission again at publish', async () => {
    await scenario(async (s) => {
      const asAdmin = await s.as(roles().admin);
      const created = await createVacancy(
        asAdmin,
        complete({ probationDays: 45 }),
        key(),
      );
      expect(
        await problem(publish(await s.as(roles().head), created.id, key())),
      ).toMatchObject({ status: 403 });
      expect(
        (await publish(await s.as(roles().admin), created.id, key()))
          .probationDays,
      ).toBe(45);
    });
  });
});

describe('Cancel my draft [STORY-VAC-01-3 AC5, D82]', () => {
  it('closes it with cancelled_at = closed_at, keeps the reason only in the side row, writes no audit row and keeps it private', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s, { positionId: world.positions.p1 });
      const ctx = await s.as(roles().recruiter, { now: LATER });
      const cancelled = await cancelVacancyDraft(ctx, created.id, {
        reason: '  Потреба зникла ',
      });
      expect(cancelled).toMatchObject({
        status: 'CANCELLED',
        openedAt: null,
        version: created.version + 1,
        updatedAt: LATER.toISOString(),
      });
      expect(await row(s.tx, created.id)).toMatchObject({
        status: 'CANCELLED',
        closedAt: LATER,
        cancelledAt: LATER,
        openedAt: null,
        deletedAt: null,
      });
      const events = await eventsOf(s.tx, created.id);
      const last = events.at(-1)!;
      expect(last).toMatchObject({
        type: 'vacancy.status_changed',
        verticalId: null,
        payload: { v: 1, from: 'DRAFT', to: 'CANCELLED' },
      });
      expect(JSON.stringify(last.payload)).not.toContain('Потреба');
      const [pii] = await s.tx
        .select({ data: schema.entityEventPii.data })
        .from(schema.entityEventPii)
        .where(eq(schema.entityEventPii.eventId, last.id));
      expect(pii!.data).toEqual({ reason: 'Потреба зникла' });
      expect(await auditsOf(s.tx, created.id)).toEqual([]);
    });
  });

  it('stays visible to its author, as a cancelled vacancy, and to nobody else [D92, Edges]', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      const ctx = await s.as(roles().recruiter);
      await cancelVacancyDraft(ctx, created.id, { reason: 'Дубль' });
      expect((await getVacancyDetail(ctx, created.id)).status).toBe(
        'CANCELLED',
      );
      for (const status of [undefined, 'CANCELLED'] as const)
        expect(
          (
            await listVacancyPage(ctx, {
              limit: 100,
              ...(status ? { status } : {}),
            })
          ).items.map((item) => item.id),
        ).toContain(created.id);
      const other = await addUser(s.tx);
      for (const who of [
        'recruiter',
        'head',
        'admin',
        'teamLead',
        'hr',
        'headHr',
      ] as const) {
        const reader = await s.as(roles()[who], { userId: other });
        expect(
          await problem(getVacancyDetail(reader, created.id)),
          who,
        ).toMatchObject({ status: 404 });
        for (const status of [undefined, 'CANCELLED'] as const)
          expect(
            (
              await listVacancyPage(reader, {
                limit: 100,
                ...(status ? { status } : {}),
              })
            ).items.map((item) => item.id),
            who,
          ).not.toContain(created.id);
      }
    });
  });

  it('is final: no second cancel, edit, publish or delete', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s, { positionId: world.positions.p1 });
      const ctx = await s.as(roles().recruiter);
      const cancelled = await cancelVacancyDraft(ctx, created.id, {
        reason: 'Дубль',
      });
      for (const attempt of [
        () => cancelVacancyDraft(ctx, created.id, { reason: 'Ще раз' }),
        () =>
          patchVacancyDraft(
            ctx,
            created.id,
            edit(cancelled.version, { title: 'Нова' }),
          ),
        () => publish(ctx, created.id, key()),
        () => deleteVacancyDraft(ctx, created.id),
      ])
        expect(await problem(attempt())).toMatchObject({
          status: 409,
          code: 'VACANCY_NOT_DRAFT',
        });
    });
  });

  it('requires a reason', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      const ctx = await s.as(roles().recruiter);
      for (const reason of ['', '   ', 'a\u0000b'])
        await expect(
          cancelVacancyDraft(ctx, created.id, { reason }),
        ).rejects.toThrow();
      expect((await row(s.tx, created.id)).status).toBe('DRAFT');
    });
  });
});

describe('Delete my draft [STORY-VAC-01-3 AC5, §12, D98]', () => {
  it('soft-deletes it: deleted_at/by/reason, one author-only event, no audit row, 404 for everyone afterwards, number never reused', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      const ctx = await s.as(roles().recruiter, { now: LATER });
      expect(await deleteVacancyDraft(ctx, created.id)).toEqual({
        id: created.id,
      });
      expect(await row(s.tx, created.id)).toMatchObject({
        status: 'DRAFT',
        deletedAt: LATER,
        deletedBy: s.actorId,
        deleteReason: 'draft_deleted_by_author',
      });
      const events = await eventsOf(s.tx, created.id);
      expect(events.at(-1)).toMatchObject({
        type: 'vacancy.deleted',
        verticalId: null,
        actorId: s.actorId,
      });
      expect(await auditsOf(s.tx, created.id)).toEqual([]);
      for (const attempt of [
        () => getVacancyDetail(ctx, created.id),
        () =>
          patchVacancyDraft(
            ctx,
            created.id,
            edit(created.version, { title: 'Нова' }),
          ),
        () => publish(ctx, created.id, key()),
        () => cancelVacancyDraft(ctx, created.id, { reason: 'Дубль' }),
        () => deleteVacancyDraft(ctx, created.id),
      ])
        expect(await problem(attempt())).toMatchObject({ status: 404 });
      expect(
        (await listVacancyPage(ctx, { limit: 100 })).items.map(
          (item) => item.id,
        ),
      ).not.toContain(created.id);
      const next = await saveDraft(s);
      expect(BigInt(next.number.slice(2))).toBeGreaterThan(
        BigInt(created.number.slice(2)),
      );
    });
  });

  it('frees a slot of the live-draft cap', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      await saveDraft(s);
      expect(await countLiveDrafts(s.tx, s.actorId)).toBe(2);
      await deleteVacancyDraft(await s.as(roles().recruiter), created.id);
      expect(await countLiveDrafts(s.tx, s.actorId)).toBe(1);
    });
  });
});

describe('Nobody else touches a draft [D92, D98, STORY-VAC-01-3 AC5, AC7]', () => {
  const outcomes: [string, Who, 404][] = [
    ['another Recruiter of the vertical', 'recruiter', 404],
    [
      'a Head Recruiter of the vertical (D92 overrides the scope grant)',
      'head',
      404,
    ],
    ['an Admin (D92 overrides the global grant)', 'admin', 404],
    ['a Team Lead', 'teamLead', 404],
    ['a Team Lead who is also a Recruiter', 'teamLeadAndRecruiter', 404],
    ['a Head Recruiter of another vertical', 'headOther', 404],
    ['a Recruiter of another vertical', 'recruiterOther', 404],
    ['HR (no authoring role at all)', 'hr', 404],
    ['Head HR (no authoring role at all)', 'headHr', 404],
    ['Finance (no vacancy access)', 'finance', 404],
    ['a user without roles', 'none', 404],
  ];

  it.each(outcomes)(
    '%s gets %i on edit, publish, cancel and delete, exactly as for an unknown id, and changes nothing',
    async (_name, who, status) => {
      await scenario(async (s) => {
        const created = await saveDraft(s, { positionId: world.positions.p1 });
        const before = await row(s.tx, created.id);
        const stranger = await addUser(s.tx);
        const ctx = await s.as(roles()[who], { userId: stranger });
        for (const attempt of [
          () =>
            patchVacancyDraft(
              ctx,
              created.id,
              edit(created.version, { title: 'Чужа' }),
            ),
          () => publish(ctx, created.id, key()),
          () => cancelVacancyDraft(ctx, created.id, { reason: 'Чужа' }),
          () => deleteVacancyDraft(ctx, created.id),
        ])
          expect(await problem(attempt())).toMatchObject({ status });
        expect(await row(s.tx, created.id)).toEqual(before);
        expect(await eventsOf(s.tx, created.id)).toHaveLength(2);
        expect(await keysOf(s.tx, stranger)).toEqual([]);
      });
    },
  );

  it('gives the same 404 for an id that does not exist', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(roles().admin);
      const missing = randomUUID();
      for (const attempt of [
        () => patchVacancyDraft(ctx, missing, edit(1, { title: 'Немає' })),
        () => publish(ctx, missing, key()),
        () => cancelVacancyDraft(ctx, missing, { reason: 'Немає' }),
        () => deleteVacancyDraft(ctx, missing),
        () => deleteVacancyDraft(ctx, 'not-a-uuid'),
      ])
        expect(await problem(attempt())).toMatchObject({ status: 404 });
    });
  });

  it('answers 401 MFA_REQUIRED to an Admin who has not passed the second factor', async () => {
    await scenario(async (s) => {
      const created = await createVacancy(
        await s.as(roles().admin),
        draft(),
        key(),
      );
      const ctx = await s.as(roles().admin, { aal: 'aal1' });
      for (const attempt of [
        () =>
          patchVacancyDraft(ctx, created.id, edit(1, { title: 'Без TOTP' })),
        () => publish(ctx, created.id, key()),
        () => cancelVacancyDraft(ctx, created.id, { reason: 'Без TOTP' }),
        () => deleteVacancyDraft(ctx, created.id),
      ])
        expect(await problem(attempt())).toMatchObject({
          status: 401,
          code: 'MFA_REQUIRED',
        });
    });
  });

  it('shows an author who lost the role or the vertical 404 while the draft stays theirs, and returns it with the role [D98]', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      for (const lost of ['none', 'recruiterOther', 'teamLead'] as const) {
        const ctx = await s.as(roles()[lost]);
        for (const attempt of [
          () =>
            patchVacancyDraft(ctx, created.id, edit(1, { title: 'Без ролі' })),
          () => cancelVacancyDraft(ctx, created.id, { reason: 'Без ролі' }),
          () => deleteVacancyDraft(ctx, created.id),
        ])
          expect(await problem(attempt()), lost).toMatchObject({ status: 404 });
      }
      expect(await row(s.tx, created.id)).toMatchObject({
        status: 'DRAFT',
        deletedAt: null,
      });
      expect(
        (
          await patchVacancyDraft(
            await s.as(roles().recruiter),
            created.id,
            edit(1, { title: 'Повернулась' }),
          )
        ).title,
      ).toBe('Повернулась');
    });
  });

  it('gives an opened vacancy a visible-but-not-yours answer: 404 without an authoring grant, 403 for an author elsewhere, 409 in the vertical', async () => {
    await scenario(async (s) => {
      const stranger = await addUser(s.tx, { roles: roles().teamLead });
      const authorElsewhere = [...roles().teamLead, ...roles().recruiterOther];
      const opened = await createVacancy(
        await s.as(roles().head),
        {
          mode: 'PUBLISH',
          verticalId: world.verticals.v1,
          positionId: world.positions.p1,
          teamLeadId: stranger,
          title: 'Відкрита',
        },
        key(),
      );
      for (const [who, held, status] of [
        ['teamLead', roles().teamLead, 404],
        ['author elsewhere', authorElsewhere, 403],
        ['recruiter', roles().recruiter, 409],
        ['head', roles().head, 409],
        ['admin', roles().admin, 409],
      ] as const) {
        const ctx = await s.as(held, { userId: stranger });
        expect(
          await problem(
            patchVacancyDraft(
              ctx,
              opened.id,
              edit(opened.version, { title: 'Чужа' }),
            ),
          ),
          who,
        ).toMatchObject({ status });
      }
    });
  });
});

describe('Who sees the events of a vacancy [D92, SEC-VC-06]', () => {
  type Scenario = Parameters<Parameters<typeof scenario>[0]>[0];
  const visibleTo = async (
    s: Scenario,
    held: Roles,
    userId: string,
    id: string,
  ) =>
    (
      await s.tx
        .select({ type: schema.entityEvent.type })
        .from(schema.entityEvent)
        .where(
          and(
            eq(schema.entityEvent.vacancyId, id),
            vacancyEventReadWhere((await s.as(held, { userId })).auth),
          ),
        )
        .orderBy(schema.entityEvent.id)
    ).map((event) => event.type);

  it('keeps the events of a draft, a cancelled draft and a deleted draft to their author', async () => {
    await scenario(async (s) => {
      const stranger = await addUser(s.tx);
      const mine = await saveDraft(s, { positionId: world.positions.p1 });
      expect(await visibleTo(s, roles().recruiter, s.actorId, mine.id)).toEqual(
        ['vacancy.created', 'vacancy.recruiter_assigned'],
      );
      for (const who of [
        'recruiter',
        'head',
        'admin',
        'teamLead',
        'hr',
      ] as const)
        expect(
          await visibleTo(s, roles()[who], stranger, mine.id),
          who,
        ).toEqual([]);

      const gone = await saveDraft(s);
      await deleteVacancyDraft(await s.as(roles().recruiter), gone.id);
      expect(
        await visibleTo(s, roles().recruiter, s.actorId, gone.id),
      ).toHaveLength(3);
      expect(await visibleTo(s, roles().admin, stranger, gone.id)).toEqual([]);

      const cancelled = await saveDraft(s);
      await cancelVacancyDraft(await s.as(roles().recruiter), cancelled.id, {
        reason: 'Дубль',
      });
      expect(
        await visibleTo(s, roles().recruiter, s.actorId, cancelled.id),
      ).toHaveLength(3);
      expect(await visibleTo(s, roles().head, stranger, cancelled.id)).toEqual(
        [],
      );
    });
  });

  it('opens only the publication to everyone in scope: an unassigned recruiter, another Head Recruiter and Admin see the status change, never the draft-era events', async () => {
    await scenario(async (s) => {
      const created = await saveDraft(
        s,
        { positionId: world.positions.p1 },
        'head',
      );
      await publish(await s.as(roles().head), created.id);
      const stranger = await addUser(s.tx);
      for (const who of ['recruiter', 'head', 'admin'] as const)
        expect(
          await visibleTo(s, roles()[who], stranger, created.id),
          who,
        ).toEqual(['vacancy.status_changed']);
      expect(
        await visibleTo(s, roles().head, s.actorId, created.id),
        'the author keeps the draft-era events',
      ).toEqual(['vacancy.created', 'vacancy.status_changed']);
    });
  });

  it('follows the vacancy read scope for what was published: other vertical, Team Lead of another vacancy, assigned and unassigned recruiters', async () => {
    await scenario(async (s) => {
      const lead = await addUser(s.tx, { roles: roles().teamLead });
      const led = await saveDraft(
        s,
        { positionId: world.positions.p1, teamLeadId: lead },
        'head',
      );
      await publish(await s.as(roles().head), led.id);
      const stranger = await addUser(s.tx);
      const opened = ['vacancy.status_changed'];
      for (const [who, held, userId, expected] of [
        ['Team Lead of this vacancy', roles().teamLead, lead, opened],
        ['Team Lead of another vacancy', roles().teamLead, stranger, []],
        [
          'Recruiter of the vertical, unassigned',
          roles().recruiter,
          stranger,
          opened,
        ],
        ['Recruiter of another vertical', roles().recruiterOther, stranger, []],
        ['Head Recruiter of another vertical', roles().headOther, stranger, []],
        ['Finance', roles().finance, stranger, []],
        ['nobody', roles().none, stranger, []],
      ] as const)
        expect(await visibleTo(s, held, userId, led.id), who).toEqual(expected);

      const assignedTo = await saveDraft(s, { positionId: world.positions.p1 });
      await publish(await s.as(roles().recruiter), assignedTo.id);
      expect(
        await visibleTo(s, roles().recruiter, stranger, assignedTo.id),
        'a recruiter who is not assigned does not see a vacancy somebody else works on',
      ).toEqual([]);
      expect(
        await visibleTo(s, roles().recruiter, s.actorId, assignedTo.id),
      ).toEqual([
        'vacancy.created',
        'vacancy.recruiter_assigned',
        'vacancy.status_changed',
      ]);
    });
  });

  it('is a row filter: events without a vacancy pass, every column is qualified in the SQL a real query renders, and a vertical-wide role never reads the vacancy table', async () => {
    await scenario(async (s) => {
      const render = async (held: Roles) =>
        s.tx
          .select({ id: schema.entityEvent.id })
          .from(schema.entityEvent)
          .where(vacancyEventReadWhere((await s.as(held)).auth))
          .toSQL().sql;
      const recruiter = await render(roles().recruiter);
      expect(recruiter).toContain('"entity_event"."vacancy_id" is null');
      expect(recruiter).toContain('"entity_event"."vertical_id" is null');
      expect(recruiter).toContain('"entity_event"."actor_id" = $');
      expect(await render(roles().head)).not.toContain('from "app"."vacancy"');
      expect(await render(roles().head)).toContain(
        '"entity_event"."vertical_id" in ($',
      );
    });
  });

  it('ends an author’s access with the role: the timeline reader stops at the visibility of the vacancy itself', async () => {
    await scenario(async (s) => {
      const mine = await saveDraft(s);
      expect(
        await problem(getVacancyDetail(await s.as(roles().hr), mine.id)),
      ).toMatchObject({ status: 404 });
    });
  });
});

describe('Write throttle [SEC-CORE-09]', () => {
  it(`counts edits, publishes, cancels and deletes: the ${VACANCY_WRITE_RATE_LIMIT.perUser + 1}th write inside a minute is 429`, async () => {
    await scenario(async (s) => {
      const created = await saveDraft(s);
      const ctx = await s.as(roles().recruiter);
      for (let n = 1; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        await patchVacancyDraft(
          ctx,
          created.id,
          edit(created.version, { title: created.title }),
        );
      expect(
        await problem(
          patchVacancyDraft(
            ctx,
            created.id,
            edit(created.version, { title: 'Зайва' }),
          ),
        ),
      ).toMatchObject({ status: 429, code: 'RATE_LIMITED' });
      expect(await problem(deleteVacancyDraft(ctx, created.id))).toMatchObject({
        status: 429,
      });
      expect((await row(s.tx, created.id)).deletedAt).toBeNull();
    });
  });
});

describe('Concurrent lifecycle on committed rows [STORY-VAC-01-3 AC4, AC8, SEC-VC-03, SEC-VC-07]', () => {
  const db = () => drizzle(client, { schema });
  const raceWithLock = createLockRace(admin, probe);
  let fixture: {
    verticalId: string;
    positionId: string;
    authorId: string;
    roles: Roles;
  };

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const verticalId = randomUUID();
    const positionId = randomUUID();
    const authorId = randomUUID();
    const name = `Життєвий цикл ${suffix}`;
    await admin`insert into app.vertical (id, name) values (${verticalId}, ${`Світ ${name}`})`;
    await admin`insert into app.app_user (id, email, full_name) values (${authorId}, ${`${authorId}@fixture.test`}, 'Автор життєвого циклу')`;
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

  const ctx = (userId = fixture.authorId, userRoles = fixture.roles) =>
    contextFor(db(), userId, userRoles);
  const newDraft = async (extra: Record<string, unknown> = {}) =>
    createVacancy(
      ctx(),
      {
        mode: 'DRAFT',
        verticalId: fixture.verticalId,
        positionId: fixture.positionId,
        title: 'Паралельна чернетка',
        ...extra,
      } as CreateVacancyInput,
      key(),
    );
  const statusOf = async (id: string) =>
    (
      await admin`select status, deleted_at from app.vacancy where id = ${id}`
    )[0]!;
  const countOf = async (id: string, type: string) =>
    (
      await admin`select count(*)::int as n from app.entity_event where vacancy_id = ${id} and type = ${type}`
    )[0]!.n as number;

  it('two publishes with different keys: exactly one transition, the other gets 409 VACANCY_NOT_DRAFT', async () => {
    const created = await newDraft();
    const settled = await Promise.allSettled(
      [key(), key()].map((publishKey) =>
        publish(ctx(), created.id, publishKey, created.version),
      ),
    );
    expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = settled.find((r) => r.status === 'rejected');
    expect(await problem(Promise.reject(failure!.reason))).toMatchObject({
      status: 409,
      code: 'VACANCY_NOT_DRAFT',
    });
    expect(await countOf(created.id, 'vacancy.status_changed')).toBe(1);
    const audits =
      await admin`select count(*)::int as n from app.audit_log where entity_id = ${created.id}`;
    expect(audits[0]!.n).toBe(1);
  });

  it('five publishes with one key all return the same opened vacancy and write once', async () => {
    const created = await newDraft();
    const sharedKey = key();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        publish(ctx(), created.id, sharedKey, created.version),
      ),
    );
    expect(new Set(results.map((r) => r.id))).toEqual(new Set([created.id]));
    expect(results.every((r) => r.status === 'OPEN')).toBe(true);
    expect(await countOf(created.id, 'vacancy.status_changed')).toBe(1);
  });

  it('a publish and a delete of the same draft: whoever locks first wins, the other is refused, nothing is half done', async () => {
    const created = await newDraft();
    const [published, deleted] = await Promise.allSettled([
      publish(ctx(), created.id, key()),
      deleteVacancyDraft(ctx(), created.id),
    ]);
    const state = await statusOf(created.id);
    if (published.status === 'fulfilled') {
      expect(deleted.status).toBe('rejected');
      expect(state.status).toBe('OPEN');
      expect(state.deleted_at).toBeNull();
    } else {
      expect(deleted.status).toBe('fulfilled');
      expect(state.status).toBe('DRAFT');
      expect(state.deleted_at).not.toBeNull();
      expect(await problem(Promise.reject(published.reason))).toMatchObject({
        status: 404,
      });
    }
    expect(await countOf(created.id, 'vacancy.status_changed')).toBe(
      published.status === 'fulfilled' ? 1 : 0,
    );
  });

  it('a publish queued behind an in-flight deactivation of its Team Lead is refused and the draft stays a draft', async () => {
    const leadId = await newLead();
    const created = await newDraft({ teamLeadId: leadId });
    const refused = await raceWithLock(
      (tx) =>
        tx`select id from app.app_user where id = ${leadId} for no key update`,
      async (tx) => {
        await tx`update app.app_user set is_active = false, deactivated_at = now() where id = ${leadId}`;
      },
      () => problem(publish(ctx(), created.id, key())),
    );
    expect(refused).toEqual({
      status: 400,
      code: 'VALIDATION_FAILED',
      errors: [{ path: 'body.teamLeadId', code: 'invalid_team_lead' }],
    });
    expect((await statusOf(created.id)).status).toBe('DRAFT');
  });

  it('a publish queued behind the removal of the Team Lead role reads the role after the lock and is refused', async () => {
    const leadId = await newLead();
    const created = await newDraft({ teamLeadId: leadId });
    const refused = await raceWithLock(
      (tx) =>
        tx`select id from app.app_user where id = ${leadId} for no key update`,
      async (tx) => {
        await tx`delete from app.user_role where user_id = ${leadId} and role = 'TEAM_LEAD'`;
      },
      () => problem(publish(ctx(), created.id, key())),
    );
    expect(refused).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
    expect((await statusOf(created.id)).status).toBe('DRAFT');
  });

  it('a publish queued behind the removal of the author own role is 404 on fresh role rows, and the draft is untouched [D98]', async () => {
    const authorId = randomUUID();
    await admin`insert into app.app_user (id, email, full_name) values (${authorId}, ${`${authorId}@fixture.test`}, 'Автор, що втрачає роль')`;
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${authorId}, 'HEAD_RECRUITER', ${fixture.verticalId})`;
    const created = await createVacancy(
      ctx(authorId),
      {
        mode: 'DRAFT',
        verticalId: fixture.verticalId,
        positionId: fixture.positionId,
        title: 'Чернетка без ролі',
      },
      key(),
    );
    const refused = await raceWithLock(
      (tx) =>
        tx`select id from app.app_user where id = ${authorId} for no key update`,
      async (tx) => {
        await tx`delete from app.user_role where user_id = ${authorId}`;
      },
      () => problem(publish(ctx(authorId), created.id, key())),
    );
    expect(refused).toMatchObject({ status: 404 });
    expect((await statusOf(created.id)).status).toBe('DRAFT');
    expect(await countOf(created.id, 'vacancy.status_changed')).toBe(0);
  });

  it('a publish queued behind an in-flight deactivation of its position is refused with 409 POSITION_INACTIVE', async () => {
    const positionId = randomUUID();
    const name = `Посада гонки ${randomUUID().slice(0, 8)}`;
    await admin`insert into app.position (id, vertical_id, name, name_key, created_by)
      values (${positionId}, ${fixture.verticalId}, ${name}, ${positionNameKey(name)}, ${fixture.authorId})`;
    const created = await newDraft({ positionId });
    const refused = await raceWithLock(
      (tx) =>
        tx`select id from app.position where id = ${positionId} for no key update`,
      async (tx) => {
        await tx`update app.position set is_active = false where id = ${positionId}`;
      },
      () => problem(publish(ctx(), created.id, key())),
    );
    expect(refused).toMatchObject({ status: 409, code: 'POSITION_INACTIVE' });
    expect((await statusOf(created.id)).status).toBe('DRAFT');
  });

  it('an edit racing a publish at the same version: whoever commits first wins, the other is refused and the draft is never half changed', async () => {
    const created = await newDraft();
    const [published, edited] = await Promise.allSettled([
      publish(ctx(), created.id, key(), created.version),
      patchVacancyDraft(
        ctx(),
        created.id,
        edit(created.version, { title: 'Після публікації' }),
      ),
    ]);
    const [state] =
      await admin`select title, status from app.vacancy where id = ${created.id}`;
    if (published.status === 'fulfilled') {
      expect(edited.status).toBe('rejected');
      expect(
        await problem(Promise.reject((edited as PromiseRejectedResult).reason)),
      ).toMatchObject({ status: 409, code: 'VACANCY_NOT_DRAFT' });
      expect(state).toMatchObject({
        status: 'OPEN',
        title: 'Паралельна чернетка',
      });
    } else {
      expect(edited.status).toBe('fulfilled');
      expect(await problem(Promise.reject(published.reason))).toMatchObject({
        status: 409,
        code: 'STALE_STATE',
      });
      expect(state).toMatchObject({
        status: 'DRAFT',
        title: 'Після публікації',
      });
    }
  });

  it('a publish at an old version is refused even when the draft only changed in a tab of the author', async () => {
    const created = await newDraft();
    await patchVacancyDraft(
      ctx(),
      created.id,
      edit(created.version, { headcount: 4 }),
    );
    expect(
      await problem(publish(ctx(), created.id, key(), created.version)),
    ).toMatchObject({ status: 409, code: 'STALE_STATE' });
    expect((await statusOf(created.id)).status).toBe('DRAFT');
    expect(
      (await publish(ctx(), created.id, key(), created.version + 1)).status,
    ).toBe('OPEN');
  });

  it('publishes in at most 11 statements, one of them the compare-and-set write [PERF-02]', async () => {
    const created = await newDraft();
    const logged: string[] = [];
    const counting = drizzle(client, {
      schema,
      logger: { logQuery: (query) => void logged.push(query) },
    });
    await publish(
      contextFor(counting, fixture.authorId, fixture.roles),
      created.id,
      key(),
      created.version,
    );
    expect(logged.length).toBeLessThanOrEqual(11);
    expect(
      logged.filter((query) => /^update "app"."vacancy"/i.test(query)),
    ).toHaveLength(1);
  });

  async function newLead() {
    const leadId = randomUUID();
    await admin`insert into app.app_user (id, email, full_name) values (${leadId}, ${`${leadId}@fixture.test`}, 'Тімлід гонки')`;
    await admin`insert into app.user_role (user_id, role, vertical_id) values (${leadId}, 'TEAM_LEAD', ${fixture.verticalId})`;
    return leadId;
  }
});
