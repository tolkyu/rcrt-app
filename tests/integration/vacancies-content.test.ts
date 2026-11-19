import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  vacancyIdParamsSchema,
  VACANCY_WRITE_RATE_LIMIT,
} from '../../lib/schemas/vacancy';
import {
  updateVacancyContentSchema,
  vacancyContentSchema,
} from '../../lib/schemas/vacancy-content';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import { updateVacancyContent } from '../../server/services/vacancy-content';
import { TEST_APP_URL } from '../support/auth-fakes';
import { createAuthFixture } from '../support/auth-fixture';
import {
  addPosition,
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
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 4, prepare: false });
let world: VacancyWorld;
let scenario: ReturnType<typeof createScenarioRunner>;
let jwks: Awaited<ReturnType<typeof startJwksFixture>>;
let fixture: ReturnType<typeof createAuthFixture>;
let filled: string;
let cancelledDraft: string;
const doc = (
  text = 'Contact private@example.test https://example.test/private',
) => ({
  type: 'doc' as const,
  content: [
    { type: 'paragraph' as const, content: [{ type: 'text' as const, text }] },
  ],
});
const patch = { expectedVersion: 1, descriptionDoc: doc() };

beforeAll(async () => {
  world = await createVacancyWorld(admin);
  scenario = createScenarioRunner(client);
  filled = await world.addVacancy({
    status: 'FILLED',
    closed_at: WORLD_OPENED_AT,
  });
  cancelledDraft = await world.addVacancy({
    status: 'CANCELLED',
    opened_at: null,
    closed_at: WORLD_OPENED_AT,
    cancelled_at: WORLD_OPENED_AT,
  });
  jwks = await startJwksFixture();
  fixture = createAuthFixture(jwks);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([admin.end(), client.end(), jwks.stop(), fixture.close()]);
});
type Scenario = Parameters<Parameters<typeof scenario>[0]>[0];
const rowOf = async (s: Scenario, id: string) =>
  (
    await s.tx.select().from(schema.vacancy).where(eq(schema.vacancy.id, id))
  )[0]!;
const history = async (s: Scenario, id: string) => ({
  events: await s.tx
    .select()
    .from(schema.entityEvent)
    .where(eq(schema.entityEvent.vacancyId, id))
    .orderBy(schema.entityEvent.id),
  audits: await s.tx
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.entityId, id))
    .orderBy(schema.auditLog.id),
});
async function untouched(s: Scenario, id: string) {
  expect((await rowOf(s, id)).version).toBe(1);
  expect(await history(s, id)).toEqual({ events: [], audits: [] });
}

describe('content saves and field-only history [STORY-VAC-01-2a]', () => {
  it.each(['head', 'admin', 'recruiter', 'teamLead'] as const)(
    '%s saves only supplied content',
    async (actor) => {
      await scenario(async (s) => {
        const id = world.v.assignedOpen;
        const userId =
          actor === 'recruiter'
            ? world.users.recA
            : actor === 'teamLead'
              ? world.users.tlA
              : s.actorId;
        const ctx = await s.as(rolesOf(world)[actor], { userId });
        const before = await rowOf(s, id);
        const result = await updateVacancyContent(ctx, id, {
          ...patch,
          requirementsDoc: doc('Required'),
        });
        expect(vacancyContentSchema.parse(result)).toEqual({
          id,
          version: 2,
          updatedAt: NOW.toISOString(),
          descriptionDoc: doc(),
          requirementsDoc: doc('Required'),
        });
        expect(await rowOf(s, id)).toEqual({
          ...before,
          version: 2,
          updatedAt: NOW,
          descriptionDoc: doc(),
          requirementsDoc: doc('Required'),
        });
        const { events, audits } = await history(s, id);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'vacancy.updated',
          subjectId: id,
          vacancyId: id,
          verticalId: world.verticals.v1,
          actorId: userId,
          payload: { v: 1, fields: ['descriptionDoc', 'requirementsDoc'] },
        });
        expect(audits).toHaveLength(1);
        expect(audits[0]).toMatchObject({
          action: 'vacancy.updated',
          before: { version: 1 },
          after: { version: 2 },
          details: { fields: ['descriptionDoc', 'requirementsDoc'] },
        });
        const serialized = JSON.stringify(
          { events, audits },
          (_key, value: unknown) =>
            typeof value === 'bigint' ? value.toString() : value,
        );
        expect(serialized).not.toContain('private@example');
        expect(serialized).not.toContain('example.test/private');
        expect(
          await s.tx
            .select()
            .from(schema.entityEventPii)
            .where(eq(schema.entityEventPii.eventId, events[0]!.id)),
        ).toEqual([]);
      });
    },
  );
  it('ON_HOLD permits whole replacement, omission, null clear and empty paragraph documents', async () => {
    await scenario(async (s) => {
      const id = world.v.unassignedOnHold;
      const ctx = await s.as(rolesOf(world).head);
      await updateVacancyContent(ctx, id, {
        ...patch,
        requirementsDoc: doc('Keep'),
      });
      const replacement = {
        type: 'doc' as const,
        content: [{ type: 'paragraph' as const }],
      };
      expect(
        await updateVacancyContent(ctx, id, {
          expectedVersion: 2,
          descriptionDoc: replacement,
        }),
      ).toMatchObject({
        descriptionDoc: replacement,
        requirementsDoc: doc('Keep'),
        version: 3,
      });
      expect(
        await updateVacancyContent(ctx, id, {
          expectedVersion: 3,
          requirementsDoc: null,
        }),
      ).toMatchObject({
        descriptionDoc: replacement,
        requirementsDoc: null,
        version: 4,
      });
    });
  });
  it('current canonical no-op leaves timestamp/version/history untouched; stale no-op is rejected', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      const ctx = await s.as(rolesOf(world).head);
      const before = await rowOf(s, id);
      expect(
        await updateVacancyContent(ctx, id, {
          expectedVersion: 1,
          descriptionDoc: null,
        }),
      ).toMatchObject({
        version: 1,
        updatedAt: before.updatedAt.toISOString(),
      });
      await untouched(s, id);
      expect(
        await problem(
          updateVacancyContent(ctx, id, {
            expectedVersion: 2,
            descriptionDoc: null,
          }),
        ),
      ).toEqual({ status: 409, code: 'STALE_STATE' });
      await untouched(s, id);
    });
  });
  it('only actually changed fields enter history, in catalog order', async () => {
    await scenario(async (s) => {
      const id = world.v.assignedOpen;
      await updateVacancyContent(await s.as(rolesOf(world).head), id, {
        expectedVersion: 1,
        descriptionDoc: null,
        requirementsDoc: doc(),
      });
      const { events, audits } = await history(s, id);
      expect(events[0]!.payload).toEqual({ v: 1, fields: ['requirementsDoc'] });
      expect(audits[0]!.details).toEqual({ fields: ['requirementsDoc'] });
    });
  });
});

describe('content denials and order [D92, D133]', () => {
  it.each(['hr', 'headHr', 'recruiter'] as const)(
    'visible %s gets 403 before stale/no-op',
    async (actor) => {
      await scenario(async (s) => {
        const id = world.v.unassignedOpen;
        expect(
          await problem(
            updateVacancyContent(await s.as(rolesOf(world)[actor]), id, {
              expectedVersion: 9,
              descriptionDoc: null,
            }),
          ),
        ).toEqual({ status: 403, code: 'FORBIDDEN' });
        await untouched(s, id);
      });
    },
  );
  it.each(['finance', 'headOther', 'teamLead'] as const)(
    'invisible %s gets 404',
    async (actor) => {
      await scenario(async (s) => {
        expect(
          await problem(
            updateVacancyContent(
              await s.as(rolesOf(world)[actor]),
              world.v.assignedOpen,
              patch,
            ),
          ),
        ).toEqual({ status: 404, code: 'NOT_FOUND' });
        await untouched(s, world.v.assignedOpen);
      });
    },
  );
  it('unknown/deleted/malformed/private draft is 404 even to Admin', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).admin);
      for (const id of [
        randomUUID(),
        'invalid',
        world.v.deleted,
        world.v.draft,
        cancelledDraft,
      ])
        expect(await problem(updateVacancyContent(ctx, id, patch))).toEqual({
          status: 404,
          code: 'NOT_FOUND',
        });
    });
  });
  it.each(['filled', 'cancelled', 'draft', 'cancelledDraft'] as const)(
    'authorized %s is locked before version/no-op',
    async (kind) => {
      await scenario(async (s) => {
        const id =
          kind === 'filled'
            ? filled
            : kind === 'cancelledDraft'
              ? cancelledDraft
              : world.v[kind];
        const ctx = await s.as(rolesOf(world).head, {
          userId: world.users.admin,
        });
        expect(
          await problem(
            updateVacancyContent(ctx, id, {
              expectedVersion: 99,
              descriptionDoc: null,
            }),
          ),
        ).toEqual({ status: 409, code: 'VACANCY_CONTENT_LOCKED' });
        await untouched(s, id);
      });
    },
  );
  it('visible HR on a closed vacancy is denied before the status disclosure', async () => {
    await scenario(async (s) => {
      expect(
        await problem(
          updateVacancyContent(await s.as(rolesOf(world).hr), filled, patch),
        ),
      ).toEqual({ status: 403, code: 'FORBIDDEN' });
    });
  });
  it('shared write budget counts no-ops once per call', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).head);
      for (let i = 0; i < VACANCY_WRITE_RATE_LIMIT.perUser; i++)
        await updateVacancyContent(ctx, world.v.assignedOpen, {
          expectedVersion: 1,
          descriptionDoc: null,
        });
      expect(
        await problem(updateVacancyContent(ctx, world.v.assignedOpen, patch)),
      ).toEqual({ status: 429, code: 'RATE_LIMITED' });
      await untouched(s, world.v.assignedOpen);
    });
  });
});

type AuthArgs = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];
function route(
  args: AuthArgs,
  identity: AuthArgs['identity'] | null = args.identity,
) {
  return createRouteFactory({
    db: () => args.ctx.db,
    clock: args.ctx.clock,
    appUrl: () => TEST_APP_URL,
    registry: createApiRegistry(),
    verifyIdentity: async () => identity,
  })(
    {
      method: 'PATCH',
      path: '/vacancies/{vacancyId}/content',
      operationId: 'updateVacancyContent',
      permission: 'vacancy.read',
      summary: 'Content',
      tags: ['Vacancies'],
      params: vacancyIdParamsSchema,
      body: updateVacancyContentSchema,
      response: vacancyContentSchema,
      errors: [403, 404, 409, 429],
    },
    (ctx, { params, body }) =>
      updateVacancyContent(ctx, params.vacancyId, body),
  );
}
async function httpSetup(args: AuthArgs) {
  const id = randomUUID();
  const positionId = await addPosition(
    args.ctx.db,
    args.user.verticalId,
    args.user.id,
  );
  await args.ctx.db.insert(schema.vacancy).values({
    id,
    verticalId: args.user.verticalId,
    positionId,
    title: 'HTTP content',
    status: 'OPEN',
    openedAt: NOW,
    createdBy: args.user.id,
    recruiterInitiated: true,
  });
  await args.ctx.db
    .insert(schema.vacancyRecruiter)
    .values({ vacancyId: id, userId: args.user.id, assignedBy: args.user.id });
  const call = (
    body: unknown = patch,
    options: {
      id?: string;
      csrf?: string;
      identity?: AuthArgs['identity'] | null;
      raw?: string;
    } = {},
  ) =>
    route(
      args,
      options.identity === undefined ? args.identity : options.identity,
    )(
      new Request(`${TEST_APP_URL}/api/v1/vacancies/${id}/content`, {
        method: 'PATCH',
        headers: {
          origin: TEST_APP_URL,
          'content-type': 'application/json',
          'x-csrf-protection': options.csrf ?? '1',
        },
        body: options.raw ?? JSON.stringify(body),
      }),
      { params: Promise.resolve({ vacancyId: options.id ?? id }) },
    );
  return { id, call };
}
describe('content route factory guards [SEC-CORE-09]', () => {
  it('applies the shared write limit through HTTP exactly once per no-op', async () => {
    await fixture.run(async (args) => {
      const { call } = await httpSetup(args);
      const noOp = { expectedVersion: 1, descriptionDoc: null };
      for (let i = 0; i < VACANCY_WRITE_RATE_LIMIT.perUser; i++)
        expect((await call(noOp)).status).toBe(200);
      const response = await call(noOp);
      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ code: 'RATE_LIMITED' });
    });
  });
  it('serves canonical JSON, CSRF/UUID/strict body/streamed limit and safe errors', async () => {
    await fixture.run(async (args) => {
      const { call } = await httpSetup(args);
      const saved = await call();
      expect(saved.status).toBe(200);
      expect(saved.headers.get('cache-control')).toBe('private, no-store');
      expect(vacancyContentSchema.parse(await saved.json()).version).toBe(2);
      for (const [options, status, code] of [
        [{ csrf: '0' }, 403, 'CSRF_FORBIDDEN'],
        [{ id: 'bad' }, 404, 'NOT_FOUND'],
        [{ identity: null }, 401, 'UNAUTHENTICATED'],
        [{ raw: 'x'.repeat(1024 * 1024 + 1) }, 413, 'BODY_TOO_LARGE'],
      ] as const) {
        const response = await call(patch, options);
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ code });
      }
      const invalid = await call({
        expectedVersion: 2,
        descriptionDoc: 'secret-private@example.test',
        status: 'FILLED',
      });
      expect(invalid.status).toBe(400);
      expect(JSON.stringify(await invalid.json())).not.toContain(
        'secret-private',
      );
    });
  });
  it('deactivated and revoked sessions deny before writes', async () => {
    await fixture.run(async (args) => {
      const { call } = await httpSetup(args);
      await args.ctx.db
        .update(schema.userSession)
        .set({ endedAt: NOW, endReason: 'LOGOUT' })
        .where(eq(schema.userSession.sessionId, args.user.sessionId));
      expect((await call()).status).toBe(401);
    });
    await fixture.run(async (args) => {
      const { call } = await httpSetup(args);
      await args.ctx.db
        .update(schema.appUser)
        .set({ isActive: false, deactivatedAt: NOW })
        .where(eq(schema.appUser.id, args.user.id));
      expect((await call()).status).toBe(401);
    });
  });
  it('pure Admin aal1 retains the inherited MFA_REQUIRED result', async () => {
    await fixture.run(async (args) => {
      const { call } = await httpSetup(args);
      await args.ctx.db
        .delete(schema.userRole)
        .where(eq(schema.userRole.userId, args.user.id));
      await args.ctx.db
        .insert(schema.userRole)
        .values({ userId: args.user.id, role: 'ADMIN', verticalId: null });
      const response = await call();
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'MFA_REQUIRED' });
    });
  });
});
