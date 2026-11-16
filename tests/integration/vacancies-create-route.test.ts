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
      const ids = async (query: string) =>
        (
          (await (await mine.list(query)).json()) as {
            items: { id: string }[];
          }
        ).items.map((item) => item.id);
      // D110: the draft is under «Чернетки» only, never in the list without a status.
      expect(await ids('?limit=100&status=DRAFT')).toContain(draftId);
      expect(await ids('?limit=100')).not.toContain(draftId);

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

describe('POST /api/v1/vacancies, group «Умови» contract over HTTP [STORY-VAC-01-1, VAC-01, D114..D117]', () => {
  type FieldErrors = { path: string; code: string }[];
  const refusedBodies: [string, Record<string, unknown>, FieldErrors][] = [
    [
      'a seniority outside the closed list',
      { seniority: 'Стажер' },
      [{ path: 'body.seniority', code: 'invalid_value' }],
    ],
    [
      'an employment type outside the closed list',
      { employmentType: 'Сезонна зайнятість' },
      [{ path: 'body.employmentType', code: 'invalid_value' }],
    ],
    [
      'a work format outside the closed list',
      { workFormat: 'MOON' },
      [{ path: 'body.workFormat', code: 'invalid_value' }],
    ],
    [
      'a location over 200 characters',
      { location: 'К'.repeat(201) },
      [{ path: 'body.location', code: 'too_big' }],
    ],
    [
      'a location with a zero-width character',
      { location: 'Ки​їв' },
      [{ path: 'body.location', code: 'custom' }],
    ],
    [
      'an amount without a currency',
      { salaryMinMinor: '100' },
      [{ path: 'body.salaryCurrency', code: 'custom' }],
    ],
    [
      'a currency without an amount',
      { salaryCurrency: 'USD' },
      [{ path: 'body.salaryCurrency', code: 'custom' }],
    ],
    [
      'a maximum below the minimum',
      { salaryMinMinor: '500', salaryMaxMinor: '100', salaryCurrency: 'USD' },
      [{ path: 'body.salaryMaxMinor', code: 'custom' }],
    ],
    [
      'an amount with a leading zero',
      { salaryMinMinor: '0100', salaryCurrency: 'USD' },
      [{ path: 'body.salaryMinMinor', code: 'invalid_format' }],
    ],
    [
      'an amount of 16 digits',
      { salaryMinMinor: '1000000000000000', salaryCurrency: 'USD' },
      [{ path: 'body.salaryMinMinor', code: 'invalid_format' }],
    ],
    [
      'an amount with a decimal comma',
      { salaryMinMinor: '2500,50', salaryCurrency: 'USD' },
      [{ path: 'body.salaryMinMinor', code: 'invalid_format' }],
    ],
    [
      'a lower-case currency',
      { salaryMinMinor: '100', salaryCurrency: 'usd' },
      [{ path: 'body.salaryCurrency', code: 'invalid_format' }],
    ],
    [
      'a currency of four letters',
      { salaryMinMinor: '100', salaryCurrency: 'USDT' },
      [{ path: 'body.salaryCurrency', code: 'invalid_format' }],
    ],
    [
      'a probation of 29 days',
      { probationDays: 29 },
      [{ path: 'body.probationDays', code: 'too_small' }],
    ],
    [
      'a probation of 91 days',
      { probationDays: 91 },
      [{ path: 'body.probationDays', code: 'too_big' }],
    ],
    [
      'a fractional probation',
      { probationDays: 45.5 },
      [{ path: 'body.probationDays', code: 'invalid_type' }],
    ],
  ];

  it.each(refusedBodies)(
    'refuses %s with a field error before anything is written, in both modes',
    async (_name, extra, errors) => {
      await fixture.run(async (args) => {
        const { positionId } = await setup(args);
        const mine = routes(args, args.identity);
        const rows = async () =>
          (
            await args.ctx.db
              .select({ id: schema.vacancy.id })
              .from(schema.vacancy)
              .where(eq(schema.vacancy.createdBy, args.user.id))
          ).length;
        const before = await rows();
        const bodies = [
          {
            mode: 'PUBLISH',
            verticalId: args.user.verticalId,
            positionId,
            title: 'Медіабаєр — Facebook',
          },
          {
            mode: 'DRAFT',
            verticalId: args.user.verticalId,
            title: 'Чернетка — TikTok',
          },
        ];
        for (const body of bodies) {
          const refused = await mine.create(
            { ...body, ...extra },
            { 'idempotency-key': randomUUID() },
          );
          expect(refused.status, body.mode).toBe(400);
          expect(await refused.json(), body.mode).toMatchObject({
            code: 'VALIDATION_FAILED',
            errors,
          });
        }
        expect(await rows()).toBe(before);
      });
    },
  );

  it('accepts the edges of every bound and stores the values as sent', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      const edge = await mine.create(
        {
          mode: 'PUBLISH',
          verticalId: args.user.verticalId,
          positionId,
          title: 'Граничні значення',
          location: 'К'.repeat(200),
          salaryMinMinor: '0',
          salaryMaxMinor: '999999999999999',
          salaryCurrency: 'EUR',
          seniority: 'Лід',
          employmentType: 'Проєктна зайнятість',
          workFormat: 'OFFICE',
        },
        { 'idempotency-key': randomUUID() },
      );
      expect(edge.status).toBe(201);
      expect(await edge.json()).toMatchObject({
        location: 'К'.repeat(200),
        salaryMinMinor: '0',
        salaryMaxMinor: '999999999999999',
        salaryCurrency: 'EUR',
        seniority: 'Лід',
        employmentType: 'Проєктна зайнятість',
        workFormat: 'OFFICE',
      });
      const equal = await mine.create(
        {
          mode: 'DRAFT',
          verticalId: args.user.verticalId,
          title: 'Рівна вилка',
          salaryMinMinor: '250000',
          salaryMaxMinor: '250000',
          salaryCurrency: 'UAH',
        },
        { 'idempotency-key': randomUUID() },
      );
      expect(equal.status).toBe(201);
    });
  });

  it('refuses the probation field to a Recruiter with 403 in both modes and keeps the default when it is absent', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      for (const body of [
        {
          mode: 'PUBLISH',
          verticalId: args.user.verticalId,
          positionId,
          title: 'Термін від рекрутера',
        },
        {
          mode: 'DRAFT',
          verticalId: args.user.verticalId,
          title: 'Термін від рекрутера',
        },
      ]) {
        const refused = await mine.create(
          { ...body, probationDays: 60 },
          { 'idempotency-key': randomUUID() },
        );
        expect(refused.status, body.mode).toBe(403);
        expect(await refused.json(), body.mode).toMatchObject({
          code: 'FORBIDDEN',
        });
        const created = await mine.create(body, {
          'idempotency-key': randomUUID(),
        });
        expect(created.status).toBe(201);
        expect(await created.json()).toMatchObject({ probationDays: 90 });
      }
    });
  });
});
