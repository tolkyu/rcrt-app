import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import {
  createVacancySchema,
  vacancyDetailSchema,
  vacancyIdParamsSchema,
  vacancyPageSchema,
  vacancyListQuerySchema,
  type VacancyDetail,
} from '../../lib/schemas/vacancy';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import {
  createVacancy,
  getVacancyDetail,
  listVacancyPage,
} from '../../server/services/vacancy';
import { TEST_APP_URL } from '../support/auth-fakes';
import { createAuthFixture } from '../support/auth-fixture';
import { startJwksFixture } from '../unit/auth/jwks-fixture';

let jwks: Awaited<ReturnType<typeof startJwksFixture>>;
let fixture: ReturnType<typeof createAuthFixture>;
beforeAll(async () => {
  jwks = await startJwksFixture();
  fixture = createAuthFixture(jwks);
});
afterAll(async () => {
  await Promise.all([jwks.stop(), fixture.close()]);
});

type Args = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];

/** The same route specs as `app/api/v1/vacancies`, built on the fixture's transaction so the whole HTTP path (CSRF, header, Zod, service, response schema) is exercised and rolled back. */
function routes(args: Args, identity: Args['identity']) {
  const defineRoute = createRouteFactory({
    db: () => args.ctx.db,
    clock: args.ctx.clock,
    appUrl: () => TEST_APP_URL,
    registry: createApiRegistry(),
    verifyIdentity: async () => identity,
  });
  const post = defineRoute(
    {
      method: 'POST',
      path: '/vacancies',
      operationId: 'createVacancy',
      permission: 'vacancy.read',
      requireGrant: 'vacancy.create',
      idempotent: true,
      summary: 'Create',
      tags: ['Vacancies'],
      body: createVacancySchema,
      response: vacancyDetailSchema,
      successStatus: 201,
      errors: [403, 404, 409, 429],
    },
    (ctx, { body, idempotencyKey }) => createVacancy(ctx, body, idempotencyKey),
  );
  const list = defineRoute(
    {
      method: 'GET',
      path: '/vacancies',
      operationId: 'listVacancies',
      permission: 'vacancy.read',
      summary: 'List',
      tags: ['Vacancies'],
      query: vacancyListQuerySchema,
      response: vacancyPageSchema,
      errors: [404, 429],
    },
    (ctx, { query }) => listVacancyPage(ctx, query),
  );
  const detail = defineRoute(
    {
      method: 'GET',
      path: '/vacancies/{vacancyId}',
      operationId: 'getVacancy',
      permission: 'vacancy.read',
      summary: 'Read',
      tags: ['Vacancies'],
      params: vacancyIdParamsSchema,
      response: vacancyDetailSchema,
      errors: [404],
    },
    (ctx, { params }) => getVacancyDetail(ctx, params.vacancyId),
  );
  const call = (
    handler: typeof post,
    init: { method: string; path: string; headers?: Record<string, string> },
    body?: unknown,
    params: Record<string, string> = {},
  ) =>
    handler(
      new Request(`${TEST_APP_URL}/api/v1${init.path}`, {
        method: init.method,
        headers: {
          origin: TEST_APP_URL,
          'content-type': 'application/json',
          'x-csrf-protection': '1',
          ...init.headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { params: Promise.resolve(params) },
    );
  return {
    create: (body: unknown, headers: Record<string, string> = {}) =>
      call(post, { method: 'POST', path: '/vacancies', headers }, body),
    list: (query = '') =>
      call(list, { method: 'GET', path: `/vacancies${query}` }),
    read: (id: string) =>
      call(detail, { method: 'GET', path: `/vacancies/${id}` }, undefined, {
        vacancyId: id,
      }),
  };
}

async function setup(args: Args) {
  const name = `Позиція ${randomUUID()}`;
  const [position] = await args.ctx.db
    .insert(schema.position)
    .values({
      verticalId: args.user.verticalId,
      name,
      nameKey: positionNameKey(name),
      createdBy: args.user.id,
    })
    .returning({ id: schema.position.id });
  const otherId = randomUUID();
  const otherAuth = randomUUID();
  const otherSession = await args.provider.issueSession(otherAuth);
  await args.ctx.db.insert(schema.appUser).values({
    id: otherId,
    authUserId: otherAuth,
    email: `${otherId}@fixture.test`,
    fullName: 'Інший рекрутер',
    activatedAt: args.ctx.clock.now(),
  });
  await args.ctx.db.insert(schema.userRole).values({
    userId: otherId,
    role: 'HEAD_RECRUITER',
    verticalId: args.user.verticalId,
  });
  await args.ctx.db.insert(schema.userSession).values({
    userId: otherId,
    sessionId: otherSession.sessionId,
    method: 'MAGIC_LINK',
    startedAt: args.ctx.clock.now(),
    lastSeenAt: args.ctx.clock.now(),
  });
  return {
    positionId: position!.id,
    other: {
      authUserId: otherAuth,
      sessionId: otherSession.sessionId,
      aal: 'aal1' as const,
    },
  };
}

describe('POST /api/v1/vacancies over HTTP [STORY-VAC-01-1, STORY-VAC-01-3 AC5]', () => {
  it('creates, replays by Idempotency-Key, refuses a missing key and keeps the draft private', async () => {
    await fixture.run(async (args) => {
      const { positionId, other } = await setup(args);
      const mine = routes(args, args.identity);
      const body = {
        mode: 'PUBLISH',
        verticalId: args.user.verticalId,
        positionId,
        title: 'Медіабаєр — Facebook',
        headcount: 2,
      };
      const key = randomUUID();

      const created = await mine.create(body, { 'idempotency-key': key });
      expect(created.status).toBe(201);
      expect(created.headers.get('cache-control')).toBe('private, no-store');
      const vacancy = (await created.json()) as VacancyDetail;
      expect(vacancy).toMatchObject({
        status: 'OPEN',
        headcount: 2,
        recruiterInitiated: true,
        recruiters: [{ id: args.user.id }],
      });

      const replay = await mine.create(body, { 'idempotency-key': key });
      expect(replay.status).toBe(201);
      expect(((await replay.json()) as VacancyDetail).id).toBe(vacancy.id);

      const reused = await mine.create(
        { ...body, headcount: 3 },
        { 'idempotency-key': key },
      );
      expect(reused.status).toBe(409);
      expect(await reused.json()).toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
      });

      for (const headers of [{}, { 'idempotency-key': 'short' }] as Record<
        string,
        string
      >[]) {
        const refused = await mine.create(body, headers);
        expect(refused.status).toBe(400);
        expect(await refused.json()).toMatchObject({
          code: 'VALIDATION_FAILED',
          errors: [{ path: 'header.Idempotency-Key', code: 'invalid_key' }],
        });
      }

      const draft = await mine.create(
        {
          mode: 'DRAFT',
          verticalId: args.user.verticalId,
          title: 'Чернетка — TikTok',
        },
        { 'idempotency-key': randomUUID() },
      );
      expect(draft.status).toBe(201);
      const draftId = ((await draft.json()) as VacancyDetail).id;

      expect((await mine.read(draftId)).status).toBe(200);
      const own = (await (await mine.list('?limit=100')).json()) as {
        items: { id: string }[];
      };
      expect(own.items.map((item) => item.id)).toContain(draftId);

      const theirs = routes(args, other);
      const hidden = await theirs.read(draftId);
      expect(hidden.status).toBe(404);
      expect(await hidden.json()).toMatchObject({ code: 'NOT_FOUND' });
      const seen = (await (await theirs.list('?limit=100')).json()) as {
        items: { id: string }[];
      };
      expect(seen.items.map((item) => item.id)).toEqual([vacancy.id]);
    });
  });

  it('refuses a caller who is only a Team Lead: the full form is not their request path [D87]', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      await args.ctx.db
        .delete(schema.userRole)
        .where(eq(schema.userRole.userId, args.user.id));
      await args.ctx.db.insert(schema.userRole).values({
        userId: args.user.id,
        role: 'TEAM_LEAD',
        verticalId: args.user.verticalId,
      });
      const lead = routes(args, args.identity);
      const refused = await lead.create(
        {
          mode: 'PUBLISH',
          verticalId: args.user.verticalId,
          positionId,
          title: 'Запит тімліда',
        },
        { 'idempotency-key': randomUUID() },
      );
      expect(refused.status).toBe(403);
      expect(await refused.json()).toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
