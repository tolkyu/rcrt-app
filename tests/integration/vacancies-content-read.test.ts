import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { vacancyIdParamsSchema } from '../../lib/schemas/vacancy';
import { vacancyContentReadSchema } from '../../lib/schemas/vacancy-content';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import { getVacancyContent } from '../../server/services/vacancy-content';
import { TEST_APP_URL } from '../support/auth-fakes';
import { createAuthFixture } from '../support/auth-fixture';
import {
  addPosition,
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
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const probe = connectTestDatabase(urls.migration);
const client = postgres(urls.runtime, { max: 4, prepare: false });
const db = drizzle(client, { schema });
let world: VacancyWorld;
let scenario: ReturnType<typeof createScenarioRunner>;
let jwks: Awaited<ReturnType<typeof startJwksFixture>>;
let fixture: ReturnType<typeof createAuthFixture>;
let filled: string;
let cancelledDraft: string;
const doc = (text = 'Private recruiting document private@example.test') => ({
  type: 'doc' as const,
  content: [
    { type: 'paragraph' as const, content: [{ type: 'text' as const, text }] },
  ],
});
const emptyDoc = {
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const }],
};

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
  await admin`update app.vacancy set description_doc = ${admin.json(doc())}, requirements_doc = ${admin.json(emptyDoc)} where id = ${world.v.assignedOpen}`;
  jwks = await startJwksFixture();
  fixture = createAuthFixture(jwks);
});
afterAll(async () => {
  await world.cleanup();
  await Promise.all([
    admin.end(),
    probe.end(),
    client.end(),
    jwks.stop(),
    fixture.close(),
  ]);
});

describe('authorized content reader matrix [ADR-019]', () => {
  it.each([
    ['admin', undefined, true],
    ['head', undefined, true],
    ['recruiter', 'recA', true],
    ['teamLead', 'tlA', true],
    ['hr', undefined, false],
    ['headHr', undefined, false],
  ] as const)(
    '%s receives exact canonical content and effective eligibility',
    async (actor, user, canEditContent) => {
      await scenario(async (s) => {
        const ctx = await s.as(
          rolesOf(world)[actor],
          user ? { userId: world.users[user] } : {},
        );
        const [row] = await s.tx
          .select()
          .from(schema.vacancy)
          .where(eq(schema.vacancy.id, world.v.assignedOpen));
        expect(await getVacancyContent(ctx, world.v.assignedOpen)).toEqual({
          id: world.v.assignedOpen,
          version: 1,
          updatedAt: row!.updatedAt.toISOString(),
          descriptionDoc: doc(),
          requirementsDoc: emptyDoc,
          status: 'OPEN',
          canEditContent,
        });
      });
    },
  );
  it('an unassigned OPEN pool reader reads NULLs without receiving editing permission', async () => {
    await scenario(async (s) => {
      expect(
        await getVacancyContent(
          await s.as(rolesOf(world).recruiter),
          world.v.unassignedOpen,
        ),
      ).toMatchObject({
        descriptionDoc: null,
        requirementsDoc: null,
        status: 'OPEN',
        canEditContent: false,
      });
    });
  });
  it('ON_HOLD retains own TL/assigned Recruiter editing; published closed rows stay readable but locked', async () => {
    await scenario(async (s) => {
      await s.tx
        .update(schema.vacancy)
        .set({ status: 'ON_HOLD' })
        .where(eq(schema.vacancy.id, world.v.assignedOpen));
      for (const [actor, userId] of [
        ['recruiter', world.users.recA],
        ['teamLead', world.users.tlA],
      ] as const)
        expect(
          await getVacancyContent(
            await s.as(rolesOf(world)[actor], { userId }),
            world.v.assignedOpen,
          ),
        ).toMatchObject({ status: 'ON_HOLD', canEditContent: true });
      const head = await s.as(rolesOf(world).head);
      for (const id of [filled, world.v.cancelled])
        expect(await getVacancyContent(head, id)).toMatchObject({
          canEditContent: false,
        });
      expect(
        await getVacancyContent(await s.as(rolesOf(world).hr), filled),
      ).toMatchObject({ status: 'FILLED', canEditContent: false });
    });
  });
  it('author-visible drafts, including cancelled drafts, never enable this editor', async () => {
    await scenario(async (s) => {
      const author = await s.as(rolesOf(world).head, {
        userId: world.users.admin,
      });
      for (const id of [world.v.draft, cancelledDraft])
        expect(await getVacancyContent(author, id)).toMatchObject({
          id,
          canEditContent: false,
        });
      const noLongerAuthor = await s.as(rolesOf(world).hr, {
        userId: world.users.admin,
      });
      expect(
        await problem(getVacancyContent(noLongerAuthor, world.v.draft)),
      ).toEqual({ status: 404, code: 'NOT_FOUND' });
    });
  });
  it('mixed-role aal1 unions active grants without borrowing withheld GLOBAL rights', async () => {
    await scenario(async (s) => {
      const mixed: Roles = [
        ...rolesOf(world).admin,
        ...rolesOf(world).teamLead,
        ...rolesOf(world).hr,
      ];
      const ctx = await s.as(mixed, { aal: 'aal1', userId: world.users.tlA });
      expect(ctx.auth.mfaWithheldGrants.has('vacancy.content.update')).toBe(
        true,
      );
      expect(await getVacancyContent(ctx, world.v.assignedOpen)).toMatchObject({
        canEditContent: true,
      });
      expect(
        await getVacancyContent(ctx, world.v.unassignedOnHold),
      ).toMatchObject({ canEditContent: false });
      expect(
        await problem(getVacancyContent(ctx, world.v.otherAssigned)),
      ).toEqual({ status: 404, code: 'NOT_FOUND' });
    });
  });
  it.each([
    'finance',
    'none',
    'headOther',
    'recruiterOther',
    'teamLead',
  ] as const)('%s cannot read hidden documents', async (actor) => {
    await scenario(async (s) => {
      expect(
        await problem(
          getVacancyContent(
            await s.as(rolesOf(world)[actor]),
            world.v.assignedOpen,
          ),
        ),
      ).toEqual({ status: 404, code: 'NOT_FOUND' });
    });
  });
  it('missing/deleted/malformed/private rows are equally 404, Admin included', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).admin);
      for (const id of [
        randomUUID(),
        'invalid',
        world.v.deleted,
        world.v.draft,
        cancelledDraft,
      ])
        expect(await problem(getVacancyContent(ctx, id))).toEqual({
          status: 404,
          code: 'NOT_FOUND',
        });
    });
  });
  it('read-only operations leave vacancy, history, change feed and write buckets untouched', async () => {
    await scenario(async (s) => {
      const ctx = await s.as(rolesOf(world).head);
      const snapshot = async () => ({
        vacancy: await s.tx
          .select()
          .from(schema.vacancy)
          .where(eq(schema.vacancy.id, world.v.assignedOpen)),
        events: await s.tx
          .select()
          .from(schema.entityEvent)
          .where(eq(schema.entityEvent.vacancyId, world.v.assignedOpen)),
        audit: await s.tx
          .select()
          .from(schema.auditLog)
          .where(eq(schema.auditLog.entityId, world.v.assignedOpen)),
        feed: await s.tx.select().from(schema.changeFeed),
        limits: await s.tx.select().from(schema.rateLimitBucket),
      });
      const before = await snapshot();
      for (let n = 0; n < 31; n++)
        await getVacancyContent(ctx, world.v.assignedOpen);
      expect(await snapshot()).toEqual(before);
    });
  });
  it('one scoped SELECT loads documents and assignments, without transaction/lock or secondary lookups', async () => {
    const queries: string[] = [];
    const counted = drizzle(client, {
      schema,
      logger: { logQuery: (query) => queries.push(query) },
    });
    const result = await getVacancyContent(
      contextFor(counted, world.users.admin, world.roles.admin),
      world.v.assignedOpen,
    );
    expect(result.canEditContent).toBe(true);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/^select /i);
    expect(queries[0]).toContain('jsonb_agg');
    expect(queries[0]).not.toMatch(/for (?:share|update|no key update)/i);
  });
});

describe('content read snapshot and next-read revocation [ADR-019]', () => {
  it('concurrent revision/status/assignment changes yield a coherent revision and fresh permissions', async () => {
    const id = await world.addVacancy({}, [world.users.recA, world.users.recB]);
    const roles: Roles = [
      ...world.roles.recA,
      { role: 'HR', verticalId: world.verticals.v1 },
    ];
    const ctx = contextFor(db, world.users.recA, roles);
    let release: () => void = () => {};
    let ready: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holding = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const changing = admin.begin(async (tx) => {
      await tx`lock table app.vacancy in access exclusive mode`;
      await tx`update app.vacancy set version = 2, status = 'ON_HOLD', description_doc = ${tx.json(doc('New revision'))} where id = ${id}`;
      await tx`delete from app.vacancy_recruiter where vacancy_id = ${id} and user_id = ${world.users.recA}`;
      ready();
      await held;
    });
    await holding;
    const reading = getVacancyContent(ctx, id);
    try {
      const deadline = Date.now() + 10_000;
      for (;;) {
        const waiting =
          await probe`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and state = 'active' and query ilike '%jsonb_agg%'`;
        if (waiting.length) break;
        if (Date.now() > deadline)
          throw new Error(
            'The content SELECT did not queue behind the table lock',
          );
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      release();
      await changing;
      const result = await reading;
      expect([
        {
          version: 1,
          status: 'OPEN',
          descriptionDoc: null,
          canEditContent: true,
        },
        {
          version: 2,
          status: 'ON_HOLD',
          descriptionDoc: doc('New revision'),
          canEditContent: false,
        },
      ]).toContainEqual({
        version: result.version,
        status: result.status,
        descriptionDoc: result.descriptionDoc,
        canEditContent: result.canEditContent,
      });
      expect(await getVacancyContent(ctx, id)).toMatchObject({
        version: 2,
        status: 'ON_HOLD',
        descriptionDoc: doc('New revision'),
        canEditContent: false,
      });
      expect(
        await problem(
          getVacancyContent(
            contextFor(db, world.users.recA, world.roles.recA),
            id,
          ),
        ),
      ).toEqual({ status: 404, code: 'NOT_FOUND' });
    } finally {
      release();
      await changing;
      await reading.catch(() => undefined);
    }
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
      method: 'GET',
      path: '/vacancies/{vacancyId}/content',
      operationId: 'getVacancyContent',
      permission: 'vacancy.read',
      summary: 'Read content',
      tags: ['Vacancies'],
      params: vacancyIdParamsSchema,
      response: vacancyContentReadSchema,
      errors: [404],
    },
    (ctx, { params }) => getVacancyContent(ctx, params.vacancyId),
  );
}
async function http(args: AuthArgs) {
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
    title: 'Content read HTTP',
    status: 'OPEN',
    openedAt: NOW,
    createdBy: args.user.id,
    recruiterInitiated: true,
    descriptionDoc: doc(),
  });
  await args.ctx.db
    .insert(schema.vacancyRecruiter)
    .values({ vacancyId: id, userId: args.user.id, assignedBy: args.user.id });
  return {
    id,
    get: (
      options: { id?: string; identity?: AuthArgs['identity'] | null } = {},
    ) =>
      route(
        args,
        options.identity === undefined ? args.identity : options.identity,
      )(
        new Request(`${TEST_APP_URL}/api/v1/vacancies/${id}/content`, {
          headers: { 'X-Activity': 'background' },
        }),
        { params: Promise.resolve({ vacancyId: options.id ?? id }) },
      ),
  };
}
describe('content HTTP guard and response contract [ADR-019]', () => {
  it('refreshes mixed-role aal1 permissions on each authenticated read', async () => {
    await fixture.run(async (args) => {
      const { get, id } = await http(args);
      await args.ctx.db.insert(schema.userRole).values([
        { userId: args.user.id, role: 'ADMIN', verticalId: null },
        { userId: args.user.id, role: 'HR', verticalId: args.user.verticalId },
      ]);
      expect(await (await get()).json()).toMatchObject({
        canEditContent: true,
      });
      await args.ctx.db
        .delete(schema.vacancyRecruiter)
        .where(eq(schema.vacancyRecruiter.vacancyId, id));
      expect(await (await get()).json()).toMatchObject({
        descriptionDoc: doc(),
        canEditContent: false,
      });
      await args.ctx.db
        .delete(schema.userRole)
        .where(eq(schema.userRole.userId, args.user.id));
      const denied = await get();
      expect(denied.status).toBe(404);
      expect(await denied.json()).toMatchObject({ code: 'NOT_FOUND' });
    });
  });
  it('serves validated no-store JSON without a CSRF header and no-store 404 problems', async () => {
    await fixture.run(async (args) => {
      const { get, id } = await http(args);
      const response = await get();
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(
        vacancyContentReadSchema.parse(await response.json()),
      ).toMatchObject({
        id,
        descriptionDoc: doc(),
        status: 'OPEN',
        canEditContent: true,
      });
      const missing = await get({ id: 'invalid' });
      expect(missing.status).toBe(404);
      expect(missing.headers.get('cache-control')).toBe('private, no-store');
      expect(await missing.json()).toMatchObject({ code: 'NOT_FOUND' });
    });
  });
  it.each(['none', 'expired', 'inactive', 'mfa'] as const)(
    '%s session never discloses stored content',
    async (kind) => {
      await fixture.run(async (args) => {
        const { get } = await http(args);
        if (kind === 'expired')
          await args.ctx.db
            .update(schema.userSession)
            .set({ endedAt: NOW, endReason: 'LOGOUT' })
            .where(eq(schema.userSession.sessionId, args.user.sessionId));
        if (kind === 'inactive')
          await args.ctx.db
            .update(schema.appUser)
            .set({ isActive: false, deactivatedAt: NOW })
            .where(eq(schema.appUser.id, args.user.id));
        if (kind === 'mfa') {
          await args.ctx.db
            .delete(schema.userRole)
            .where(eq(schema.userRole.userId, args.user.id));
          await args.ctx.db
            .insert(schema.userRole)
            .values({ userId: args.user.id, role: 'ADMIN', verticalId: null });
        }
        const response = await get(kind === 'none' ? { identity: null } : {});
        expect(response.status).toBe(401);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        const body = await response.json();
        expect(body).toMatchObject({
          code: {
            none: 'UNAUTHENTICATED',
            expired: 'SESSION_EXPIRED',
            inactive: 'USER_DEACTIVATED',
            mfa: 'MFA_REQUIRED',
          }[kind],
        });
        expect(JSON.stringify(body)).not.toContain('private@example');
      });
    },
  );
});
