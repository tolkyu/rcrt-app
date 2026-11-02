import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  teamLeadPriorityParamsSchema,
  updateTeamLeadPrioritiesSchema,
  verticalTeamLeadPrioritiesSchema,
} from '../../lib/schemas/team-lead-priority';
import { buildAuthContext } from '../../server/authz/context';
import type { UserId } from '../../server/authz/types';
import {
  loadAuthContext,
  type RequestContext,
} from '../../server/context/request-context';
import type { VerifiedIdentity } from '../../server/context/identity';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import {
  deactivateUser,
  reactivateUser,
} from '../../server/services/user-activation';
import { updateUserRoles } from '../../server/services/user-roles';
import { getAuditRecord, listAudit } from '../../server/services/audit';
import { listUserEventPage } from '../../server/services/user';
import {
  getVerticalTeamLeadPriorities,
  listTeamLeadPriorityVerticals,
  updateTeamLeadPriorities,
} from '../../server/services/team-lead-priority';
import { createAuthFixture } from '../support/auth-fixture';
import { TEST_APP_URL } from '../support/auth-fakes';
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 6, prepare: false });
const concurrentDb = drizzle(client, { schema });
let jwks: Awaited<ReturnType<typeof startJwksFixture>>;
let fixture: ReturnType<typeof createAuthFixture>;
beforeAll(async () => {
  jwks = await startJwksFixture();
  fixture = createAuthFixture(jwks);
});
afterAll(async () => {
  await Promise.all([fixture.close(), jwks.stop(), client.end(), admin.end()]);
});
type Fixture = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];
type Change = {
  userId: string;
  priority: number | null;
  version: number | null;
};

async function caller(
  args: Fixture,
  role = 'ADMIN',
  aal: 'aal1' | 'aal2' = 'aal2',
): Promise<RequestContext> {
  if (role !== 'RECRUITER')
    await args.ctx.db.insert(schema.userRole).values({
      userId: args.user.id,
      role,
      verticalId:
        role === 'ADMIN' || role === 'FINANCE' ? null : args.user.verticalId,
    });
  await args.markMfaVerified();
  const identity = { ...args.identity, aal };
  return {
    ...args.ctx,
    identity,
    auth: await loadAuthContext(args.ctx.db, identity, args.ctx.clock),
  };
}
async function lead(
  args: Fixture,
  name: string,
  options: {
    active?: boolean;
    accepted?: boolean;
    verticalId?: string;
    priority?: number;
  } = {},
) {
  const userId = randomUUID();
  const authUserId = randomUUID();
  const now = args.ctx.clock.now();
  await args.ctx.db.insert(schema.appUser).values({
    id: userId,
    authUserId,
    email: `${userId}@fixture.test`,
    fullName: name,
    isActive: options.active ?? true,
    activatedAt: options.accepted === false ? null : now,
    deactivatedAt: options.active === false ? now : null,
  });
  await args.ctx.db.insert(schema.userRole).values({
    userId,
    role: 'TEAM_LEAD',
    verticalId: options.verticalId ?? args.user.verticalId,
  });
  if (options.priority !== undefined)
    await args.ctx.db.insert(schema.teamLeadPriority).values({
      userId,
      verticalId: options.verticalId ?? args.user.verticalId,
      priority: options.priority,
    });
  return { userId, authUserId };
}
const priorityRows = (ctx: RequestContext, userId: string) =>
  ctx.db
    .select()
    .from(schema.teamLeadPriority)
    .where(eq(schema.teamLeadPriority.userId, userId));
const priorityEvents = (ctx: RequestContext, userId: string) =>
  ctx.db
    .select()
    .from(schema.entityEvent)
    .where(
      and(
        eq(schema.entityEvent.subjectId, userId),
        eq(schema.entityEvent.type, 'vertical.tl_priority_changed'),
      ),
    );
const save = (ctx: RequestContext, verticalId: string, changes: Change[]) =>
  updateTeamLeadPriorities(ctx, verticalId, { changes });

describe('Team Lead priorities [STORY-ROLE-01-3, D5, D47, D73]', () => {
  it.each([
    'HEAD_RECRUITER',
    'RECRUITER',
    'HEAD_HR',
    'HR',
    'TEAM_LEAD',
    'FINANCE',
  ])(
    'denies list, detail and changes to %s even in their own vertical',
    async (role) => {
      await fixture.run(async (args) => {
        const ctx = await caller(args, role);
        const target = await lead(args, 'Тімлід без доступу');
        await expect(listTeamLeadPriorityVerticals(ctx)).rejects.toMatchObject({
          status: 404,
        });
        await expect(
          getVerticalTeamLeadPriorities(ctx, args.user.verticalId),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
          save(ctx, args.user.verticalId, [
            { userId: target.userId, priority: 0, version: null },
          ]),
        ).rejects.toMatchObject({ status: 404 });
        expect(await priorityRows(ctx, target.userId)).toHaveLength(0);
      });
    },
  );
  it('requires verified MFA for Admin', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args, 'ADMIN', 'aal1');
      await expect(
        getVerticalTeamLeadPriorities(ctx, args.user.verticalId),
      ).rejects.toMatchObject({ status: 401, code: 'MFA_REQUIRED' });
      await expect(
        save(ctx, args.user.verticalId, [
          { userId: args.user.id, priority: 0, version: null },
        ]),
      ).rejects.toMatchObject({ status: 401, code: 'MFA_REQUIRED' });
    });
  });
  it('lists accepted active TLs by priority, Ukrainian name for ties, then unprioritised; counts only invitees with a live invite', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const z = await lead(args, 'Ярина', { priority: 0 });
      const a = await lead(args, 'Андрій', { priority: 0 });
      const none = await lead(args, 'Без номера');
      await lead(args, 'Неактивний', { active: false, priority: 1 });
      const pending = await lead(args, 'Запрошений', { accepted: false });
      const revoked = await lead(args, 'Відкликаний', { accepted: false });
      const expired = await lead(args, 'Прострочений', { accepted: false });
      const sent = args.ctx.clock.now();
      const expiredSent = new Date(sent.getTime() - 96 * 3_600_000);
      await args.ctx.db.insert(schema.userInvite).values([
        {
          userId: expired.userId,
          tokenHash: randomBytes(32),
          roles: [{ role: 'TEAM_LEAD', verticalId: args.user.verticalId }],
          sentAt: expiredSent,
          expiresAt: new Date(expiredSent.getTime() + 72 * 3_600_000),
          invitedBy: args.user.id,
        },
        {
          userId: pending.userId,
          tokenHash: randomBytes(32),
          roles: [{ role: 'TEAM_LEAD', verticalId: args.user.verticalId }],
          sentAt: sent,
          expiresAt: new Date(sent.getTime() + 72 * 3_600_000),
          invitedBy: args.user.id,
        },
        {
          userId: revoked.userId,
          tokenHash: randomBytes(32),
          roles: [{ role: 'TEAM_LEAD', verticalId: args.user.verticalId }],
          sentAt: sent,
          expiresAt: new Date(sent.getTime() + 72 * 3_600_000),
          invitedBy: args.user.id,
          status: 'REVOKED',
          revokedAt: sent,
          revokedBy: args.user.id,
        },
      ]);
      const page = await getVerticalTeamLeadPriorities(
        ctx,
        args.user.verticalId,
      );
      expect(page.items.map((item) => item.userId)).toEqual([
        a.userId,
        z.userId,
        none.userId,
      ]);
      expect(page.items.map((item) => item.priority)).toEqual([0, 0, null]);
      expect(page.pendingInvites).toBe(1);
      expect(page.vertical.id).toBe(args.user.verticalId);
    });
  });
  it('saves a batch with ties and zero, records one atomic audit and user-history event per changed TL', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const a = await lead(args, 'Перший', { priority: 3 });
      const b = await lead(args, 'Другий');
      const page = await save(ctx, args.user.verticalId, [
        { userId: a.userId, priority: 0, version: 1 },
        { userId: b.userId, priority: 0, version: null },
      ]);
      expect(page.items.filter((item) => item.priority === 0)).toHaveLength(2);
      for (const target of [a, b]) {
        const events = await priorityEvents(ctx, target.userId);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          subjectType: 'app_user',
          subjectId: target.userId,
          verticalId: args.user.verticalId,
          payload: {
            userId: target.userId,
            old: target === a ? 3 : null,
            new: 0,
          },
        });
        const history = await listUserEventPage(ctx, target.userId, {
          limit: 20,
        });
        expect(
          history.items.find(
            (event) => event.type === 'vertical.tl_priority_changed',
          )?.priorityChange,
        ).toEqual({
          vertical: {
            id: args.user.verticalId,
            name: `Вертикаль ${args.user.verticalId}`,
          },
          old: target === a ? 3 : null,
          new: 0,
        });
      }
      const audits = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.entityId, args.user.verticalId),
            eq(schema.auditLog.action, 'vertical.tl_priority_changed'),
          ),
        );
      expect(audits).toHaveLength(2);
      expect(audits.every((row) => row.requestId === ctx.requestId)).toBe(true);
      expect(
        audits
          .map((row) => ({
            actorId: row.actorId,
            entityType: row.entityType,
            before: row.before,
            after: row.after,
            details: row.details,
          }))
          .sort((x, y) =>
            JSON.stringify(x.details).localeCompare(JSON.stringify(y.details)),
          ),
      ).toEqual(
        [
          { teamLead: a.userId, old: 3 },
          { teamLead: b.userId, old: null },
        ]
          .map(({ teamLead, old }) => ({
            actorId: args.user.id,
            entityType: 'vertical',
            before: { priority: old },
            after: { priority: 0 },
            details: { teamLead },
          }))
          .sort((x, y) =>
            JSON.stringify(x.details).localeCompare(JSON.stringify(y.details)),
          ),
      );
      const unchanged = await save(ctx, args.user.verticalId, [
        {
          userId: a.userId,
          priority: 0,
          version: page.items.find((item) => item.userId === a.userId)!.version,
        },
      ]);
      expect(unchanged.items).toEqual(page.items);
      expect(await priorityEvents(ctx, a.userId)).toHaveLength(1);
    });
  });
  it('names the Team Lead in the audit record view (Журнал дій detail)', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const target = await lead(args, 'Тарас Лисенко', { priority: 1 });
      await save(ctx, args.user.verticalId, [
        { userId: target.userId, priority: null, version: 1 },
      ]);
      const { items } = await listAudit(ctx, {
        entityType: 'vertical',
        entityId: args.user.verticalId,
        action: 'vertical.tl_priority_changed',
      });
      const record = await getAuditRecord(ctx, items[0]!.id);
      expect(record).toMatchObject({
        entity: { type: 'vertical', id: args.user.verticalId },
        before: { priority: 1 },
        after: { priority: null },
        details: { teamLead: target.userId },
        detailLabels: { [target.userId]: 'Тарас Лисенко' },
      });
    });
  });
  it('answers 404 for an unknown or malformed vertical id', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      for (const id of [randomUUID(), 'not-a-uuid'])
        await expect(
          getVerticalTeamLeadPriorities(ctx, id),
        ).rejects.toMatchObject({ status: 404 });
      await expect(
        save(ctx, randomUUID(), [
          { userId: args.user.id, priority: 0, version: null },
        ]),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
  it('lists every vertical for the tabs in Ukrainian alphabetical order', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const { items } = await listTeamLeadPriorityVerticals(ctx);
      const names = items.map((item) => item.name);
      expect(names).toEqual(
        [...names].sort((x, y) => x.localeCompare(y, 'uk')),
      );
      expect(items.some((item) => item.id === args.user.verticalId)).toBe(true);
    });
  });
  it('rejects a stale batch atomically even when its first row is current', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const a = await lead(args, 'Перший', { priority: 0 });
      const b = await lead(args, 'Другий', { priority: 1 });
      await expect(
        save(ctx, args.user.verticalId, [
          { userId: a.userId, priority: 9, version: 1 },
          { userId: b.userId, priority: 8, version: 4 },
        ]),
      ).rejects.toMatchObject({ status: 409, code: 'STALE_STATE' });
      expect((await priorityRows(ctx, a.userId))[0]?.priority).toBe(0);
      expect((await priorityRows(ctx, b.userId))[0]?.priority).toBe(1);
      expect(await priorityEvents(ctx, a.userId)).toHaveLength(0);
    });
  });
  it.each(['inactive', 'invitee', 'wrong-vertical', 'not-TL'] as const)(
    'rejects an ineligible %s without writing any row',
    async (kind) => {
      await fixture.run(async (args) => {
        const ctx = await caller(args);
        const otherVertical = randomUUID();
        await args.ctx.db
          .insert(schema.vertical)
          .values({ id: otherVertical, name: `Інша ${otherVertical}` });
        const target = await lead(args, 'Не підходить', {
          active: kind !== 'inactive',
          accepted: kind !== 'invitee',
          verticalId:
            kind === 'wrong-vertical' ? otherVertical : args.user.verticalId,
        });
        if (kind === 'not-TL')
          await ctx.db
            .delete(schema.userRole)
            .where(eq(schema.userRole.userId, target.userId));
        await expect(
          save(ctx, args.user.verticalId, [
            { userId: target.userId, priority: 2, version: null },
          ]),
        ).rejects.toMatchObject({ status: 409, code: 'STALE_STATE' });
        expect(await priorityRows(ctx, target.userId)).toHaveLength(0);
      });
    },
  );
  it('clears and recreates a priority without letting an old numeric version match again (ABA, SEC-TLP-02)', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const target = await lead(args, 'Повторний', { priority: 4 });
      const cleared = await save(ctx, args.user.verticalId, [
        { userId: target.userId, priority: null, version: 1 },
      ]);
      expect(
        cleared.items.find((row) => row.userId === target.userId),
      ).toMatchObject({ priority: null, version: null });
      const recreated = await save(ctx, args.user.verticalId, [
        { userId: target.userId, priority: 3, version: null },
      ]);
      expect(
        recreated.items.find((row) => row.userId === target.userId)?.version,
      ).toBeGreaterThan(1);
      await expect(
        save(ctx, args.user.verticalId, [
          { userId: target.userId, priority: 8, version: 1 },
        ]),
      ).rejects.toMatchObject({ status: 409, code: 'STALE_STATE' });
      expect((await priorityRows(ctx, target.userId))[0]?.priority).toBe(3);
      expect(
        (await priorityEvents(ctx, target.userId)).map(
          (event) => event.payload,
        ),
      ).toEqual([
        { v: 1, userId: target.userId, old: 4, new: null },
        { v: 1, userId: target.userId, old: null, new: 3 },
      ]);
    });
  });
  it('removing TEAM_LEAD clears its priority with an old→null history event, while deactivation keeps it', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const removed = await lead(args, 'Знята роль', { priority: 2 });
      await updateUserRoles(ctx, removed.userId, {
        expectedVersion: 1,
        roles: [],
      });
      expect(await priorityRows(ctx, removed.userId)).toHaveLength(0);
      expect((await priorityEvents(ctx, removed.userId))[0]?.payload).toEqual({
        v: 1,
        userId: removed.userId,
        old: 2,
        new: null,
      });
      const inactive = await lead(args, 'Деактивований', { priority: 7 });
      await deactivateUser(args.provider.dependencies(), ctx, inactive.userId, {
        expectedVersion: 1,
      });
      expect((await priorityRows(ctx, inactive.userId))[0]?.priority).toBe(7);
      expect(await priorityEvents(ctx, inactive.userId)).toHaveLength(0);
      await reactivateUser(args.provider.dependencies(), ctx, inactive.userId, {
        expectedVersion: 2,
        roles: [],
      });
      expect(await priorityRows(ctx, inactive.userId)).toHaveLength(0);
      expect((await priorityEvents(ctx, inactive.userId))[0]?.payload).toEqual({
        v: 1,
        userId: inactive.userId,
        old: 7,
        new: null,
      });
    });
  });
});

describe('Team Lead priorities through /api/v1 [STORY-ROLE-01-3, ADR-006]', () => {
  function routes(args: Fixture, identity: VerifiedIdentity) {
    const defineRoute = createRouteFactory({
      db: () => args.ctx.db,
      clock: args.ctx.clock,
      appUrl: () => TEST_APP_URL,
      registry: createApiRegistry(),
      verifyIdentity: async () => identity,
    });
    const spec = {
      path: '/verticals/{verticalId}/team-lead-priorities',
      tags: ['Priorities'],
      params: teamLeadPriorityParamsSchema,
      response: verticalTeamLeadPrioritiesSchema,
    } as const;
    const get = defineRoute(
      {
        ...spec,
        method: 'GET',
        operationId: 'getVerticalTeamLeadPriorities',
        summary: 'List',
        errors: [404],
      },
      (ctx, { params }) =>
        getVerticalTeamLeadPriorities(ctx, params.verticalId),
    );
    const put = defineRoute(
      {
        ...spec,
        method: 'PUT',
        operationId: 'updateTeamLeadPriorities',
        summary: 'Save',
        body: updateTeamLeadPrioritiesSchema,
        errors: [400, 404, 409],
      },
      (ctx, { params, body }) =>
        updateTeamLeadPriorities(ctx, params.verticalId, body),
    );
    const url = (verticalId: string) =>
      `${TEST_APP_URL}/api/v1/verticals/${verticalId}/team-lead-priorities`;
    return {
      get: (verticalId: string) =>
        get(new Request(url(verticalId)), {
          params: Promise.resolve({ verticalId }),
        }),
      put: (verticalId: string, body: unknown) =>
        put(
          new Request(url(verticalId), {
            method: 'PUT',
            headers: {
              origin: TEST_APP_URL,
              'content-type': 'application/json',
              'x-csrf-protection': '1',
            },
            body: JSON.stringify(body),
          }),
          { params: Promise.resolve({ verticalId }) },
        ),
    };
  }
  const identityOf = async (
    args: Fixture,
    role: string,
    aal: 'aal1' | 'aal2' = 'aal2',
  ) => (await caller(args, role, aal)).identity;

  it('lists and saves for an aal2 Admin', async () => {
    await fixture.run(async (args) => {
      const api = routes(args, await identityOf(args, 'ADMIN'));
      const target = await lead(args, 'Василь Мороз');
      const listed = await api.get(args.user.verticalId);
      expect(listed.status).toBe(200);
      expect(
        verticalTeamLeadPrioritiesSchema.parse(await listed.json()).items,
      ).toEqual([
        {
          userId: target.userId,
          fullName: 'Василь Мороз',
          priority: null,
          version: null,
        },
      ]);
      const saved = await api.put(args.user.verticalId, {
        changes: [{ userId: target.userId, priority: 0, version: null }],
      });
      expect(saved.status).toBe(200);
      expect((await saved.json()).items[0]).toMatchObject({ priority: 0 });
    });
  });

  it.each(['HEAD_RECRUITER', 'FINANCE'])(
    'answers 404 to %s on both methods',
    async (role) => {
      await fixture.run(async (args) => {
        const api = routes(args, await identityOf(args, role));
        const target = await lead(args, 'Тімлід');
        expect((await api.get(args.user.verticalId)).status).toBe(404);
        const response = await api.put(args.user.verticalId, {
          changes: [{ userId: target.userId, priority: 0, version: null }],
        });
        expect(response.status).toBe(404);
        expect((await response.json()).code).toBe('NOT_FOUND');
      });
    },
  );

  it('answers 401 MFA_REQUIRED to an aal1 Admin', async () => {
    await fixture.run(async (args) => {
      const api = routes(args, await identityOf(args, 'ADMIN', 'aal1'));
      const response = await api.get(args.user.verticalId);
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('MFA_REQUIRED');
    });
  });

  it('answers 404 for a malformed vertical id and 400 with field paths for invalid bodies', async () => {
    await fixture.run(async (args) => {
      const api = routes(args, await identityOf(args, 'ADMIN'));
      const target = await lead(args, 'Тімлід');
      expect((await api.get('not-a-uuid')).status).toBe(404);
      const one = (priority: unknown) => ({
        changes: [{ userId: target.userId, priority, version: null }],
      });
      const cases: [unknown, string][] = [
        [one(100), 'body.changes.0.priority'],
        [one(-1), 'body.changes.0.priority'],
        [one(1.5), 'body.changes.0.priority'],
        [{ changes: [] }, 'body.changes'],
        [
          {
            changes: [
              { userId: target.userId, priority: 1, version: null },
              {
                userId: target.userId.toUpperCase(),
                priority: 2,
                version: null,
              },
            ],
          },
          'body.changes',
        ],
        [{ ...one(1), verticalId: args.user.verticalId }, 'body'],
      ];
      for (const [body, path] of cases) {
        const response = await api.put(args.user.verticalId, body);
        expect(response.status).toBe(400);
        const problem = (await response.json()) as {
          code: string;
          errors: { path: string }[];
        };
        expect(problem.code).toBe('VALIDATION_FAILED');
        expect(problem.errors.map((error) => error.path)).toContain(path);
      }
      const rows = await args.ctx.db
        .select()
        .from(schema.teamLeadPriority)
        .where(eq(schema.teamLeadPriority.userId, target.userId));
      expect(rows).toHaveLength(0);
    });
  });

  it('a TEAM_LEAD removed and re-assigned never revives the old row version (SEC-TLP-02)', async () => {
    await fixture.run(async (args) => {
      const ctx = await caller(args);
      const target = await lead(args, 'Повернений', { priority: 4 });
      const role = { role: 'TEAM_LEAD', verticalId: args.user.verticalId };
      await updateUserRoles(ctx, target.userId, {
        expectedVersion: 1,
        roles: [],
      });
      await updateUserRoles(ctx, target.userId, {
        expectedVersion: 2,
        roles: [role],
      });
      const page = await save(ctx, args.user.verticalId, [
        { userId: target.userId, priority: 1, version: null },
      ]);
      expect(
        page.items.find((item) => item.userId === target.userId)?.version,
      ).toBeGreaterThan(1);
      await expect(
        save(ctx, args.user.verticalId, [
          { userId: target.userId, priority: 9, version: 1 },
        ]),
      ).rejects.toMatchObject({ status: 409, code: 'STALE_STATE' });
    });
  });
});

describe('Priority writes on separate connections [ADR-006, ROLE-01-3]', () => {
  const now = new Date('2026-11-16T08:00:00Z');
  const ctxFor = (actorId: string): RequestContext => ({
    db: concurrentDb,
    identity: {
      authUserId: randomUUID(),
      sessionId: randomUUID(),
      aal: 'aal2',
    },
    auth: buildAuthContext({
      userId: actorId as UserId,
      roles: [{ role: 'ADMIN', verticalId: null }],
      aal: 'aal2',
      timezone: 'Europe/Kyiv',
    }),
    clock: { now: () => new Date(now) },
    requestId: randomUUID(),
    ip: null,
    userAgent: null,
    mutationId: null,
  });
  async function committed() {
    const actorId = randomUUID();
    const userId = randomUUID();
    const verticalId = randomUUID();
    await admin`insert into app.vertical (id,name) values (${verticalId}, ${`Гонка ${verticalId}`})`;
    await admin`insert into app.app_user (id,email,full_name,activated_at) values (${actorId}, ${`${actorId}@fixture.test`}, 'Адмін пріоритетів', ${now}), (${userId}, ${`${userId}@fixture.test`}, 'Тімлід гонки', ${now})`;
    await admin`insert into app.user_role (user_id,role,vertical_id) values (${actorId}, 'ADMIN', null), (${userId}, 'TEAM_LEAD', ${verticalId})`;
    return { actorId, userId, verticalId, ctx: ctxFor(actorId) };
  }
  it('lets exactly one same-version creation commit', async () => {
    const data = await committed();
    const results = await Promise.allSettled([
      save(data.ctx, data.verticalId, [
        { userId: data.userId, priority: 0, version: null },
      ]),
      save(data.ctx, data.verticalId, [
        { userId: data.userId, priority: 1, version: null },
      ]),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { status: 409, code: 'STALE_STATE' } });
    expect(await priorityEvents(data.ctx, data.userId)).toHaveLength(1);
  });
  it('serialises a priority save with removal of its TEAM_LEAD role', async () => {
    const data = await committed();
    const results = await Promise.allSettled([
      save(data.ctx, data.verticalId, [
        { userId: data.userId, priority: 0, version: null },
      ]),
      updateUserRoles(data.ctx, data.userId, { expectedVersion: 1, roles: [] }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { status: 409, code: 'STALE_STATE' } });
    const roles = await data.ctx.db
      .select()
      .from(schema.userRole)
      .where(eq(schema.userRole.userId, data.userId));
    expect(await priorityRows(data.ctx, data.userId)).toHaveLength(
      roles.length ? 1 : 0,
    );
  });
  it('allows independent vertical-row writes for the same TL without deadlock or false conflict', async () => {
    const data = await committed();
    const other = randomUUID();
    await admin`insert into app.vertical (id,name) values (${other}, ${`Інша гонка ${other}`})`;
    await admin`insert into app.user_role (user_id,role,vertical_id) values (${data.userId}, 'TEAM_LEAD', ${other})`;
    const results = await Promise.allSettled([
      save(data.ctx, data.verticalId, [
        { userId: data.userId, priority: 2, version: null },
      ]),
      save(data.ctx, other, [
        { userId: data.userId, priority: 4, version: null },
      ]),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      (await priorityRows(data.ctx, data.userId))
        .map((row) => row.priority)
        .sort(),
    ).toEqual([2, 4]);
  });
  it('rechecks eligibility after a save waits for a concurrent role removal to commit (SEC-TLP-01)', async () => {
    const data = await committed();
    let signalLocked!: () => void;
    let release!: () => void;
    const locked = new Promise<void>((resolve) => {
      signalLocked = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const removal = concurrentDb.transaction(async (tx) => {
      await updateUserRoles({ ...data.ctx, db: tx }, data.userId, {
        expectedVersion: 1,
        roles: [],
      });
      signalLocked();
      await released;
    });
    await locked;
    const saving = save(data.ctx, data.verticalId, [
      { userId: data.userId, priority: 0, version: null },
    ]);
    try {
      await expect
        .poll(
          async () => {
            const [row] =
              await admin`select count(*)::int as count from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock' and query ilike '%app_user%'`;
            return row?.count as number;
          },
          { timeout: 5000 },
        )
        .toBeGreaterThan(0);
    } finally {
      release();
    }
    await removal;
    await expect(saving).rejects.toMatchObject({
      status: 409,
      code: 'STALE_STATE',
    });
    expect(await priorityRows(data.ctx, data.userId)).toHaveLength(0);
    expect(await priorityEvents(data.ctx, data.userId)).toHaveLength(0);
  });
});
