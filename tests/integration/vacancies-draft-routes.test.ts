import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import {
  cancelVacancySchema,
  createVacancySchema,
  patchVacancySchema,
  publishDraftSchema,
  vacancyDeletedSchema,
  vacancyDetailSchema,
  vacancyIdParamsSchema,
  type VacancyDetail,
} from '../../lib/schemas/vacancy';
import { authorsAnywhere } from '../../server/authz/vacancy-author';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import { createVacancy } from '../../server/services/vacancy';
import {
  cancelVacancyDraft,
  deleteVacancyDraft,
  patchVacancyDraft,
  publishVacancyDraft,
} from '../../server/services/vacancy-draft';
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

/** The same route specs as `app/api/v1/vacancies/[vacancyId]`, built on the fixture's transaction so CSRF, header, Zod, service and response schema run end to end and roll back. */
function routes(args: Args, identity: Args['identity']) {
  const defineRoute = createRouteFactory({
    db: () => args.ctx.db,
    clock: args.ctx.clock,
    appUrl: () => TEST_APP_URL,
    registry: createApiRegistry(),
    verifyIdentity: async () => identity,
  });
  const base = {
    permission: 'vacancy.read',
    requireGrant: 'vacancy.create',
    hideUnless: authorsAnywhere,
    summary: 'Draft action',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    errors: [403, 404, 409, 429],
  } as const;
  const create = defineRoute(
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
  const patch = defineRoute(
    {
      ...base,
      method: 'PATCH',
      path: '/vacancies/{vacancyId}',
      operationId: 'updateVacancyDraft',
      body: patchVacancySchema,
      response: vacancyDetailSchema,
    },
    (ctx, { params, body }) => patchVacancyDraft(ctx, params.vacancyId, body),
  );
  const remove = defineRoute(
    {
      ...base,
      method: 'DELETE',
      path: '/vacancies/{vacancyId}',
      operationId: 'deleteVacancyDraft',
      response: vacancyDeletedSchema,
    },
    (ctx, { params }) => deleteVacancyDraft(ctx, params.vacancyId),
  );
  const publish = defineRoute(
    {
      ...base,
      method: 'POST',
      path: '/vacancies/{vacancyId}/publish',
      operationId: 'publishVacancyDraft',
      idempotent: true,
      body: publishDraftSchema,
      response: vacancyDetailSchema,
    },
    (ctx, { params, body, idempotencyKey }) =>
      publishVacancyDraft(ctx, params.vacancyId, idempotencyKey, body),
  );
  const cancel = defineRoute(
    {
      ...base,
      method: 'POST',
      path: '/vacancies/{vacancyId}/cancel',
      operationId: 'cancelVacancyDraft',
      body: cancelVacancySchema,
      response: vacancyDetailSchema,
    },
    (ctx, { params, body }) => cancelVacancyDraft(ctx, params.vacancyId, body),
  );
  const call = (
    handler: (
      request: Request,
      context: { params: Promise<Record<string, string>> },
    ) => Promise<Response>,
    method: string,
    path: string,
    id: string,
    options: { body?: unknown; headers?: Record<string, string> } = {},
  ) =>
    handler(
      new Request(`${TEST_APP_URL}/api/v1${path}`, {
        method,
        headers: {
          origin: TEST_APP_URL,
          'content-type': 'application/json',
          'x-csrf-protection': '1',
          ...options.headers,
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      }),
      { params: Promise.resolve({ vacancyId: id }) },
    );
  const at = (id: string, suffix = '') => `/vacancies/${id}${suffix}`;
  return {
    createDraft: async (body: Record<string, unknown>) => {
      const response = await call(create, 'POST', '/vacancies', '', {
        body: { mode: 'DRAFT', ...body },
        headers: { 'idempotency-key': randomUUID() },
      });
      expect(response.status).toBe(201);
      return (await response.json()) as VacancyDetail;
    },
    patch: (id: string, body: unknown, headers?: Record<string, string>) =>
      call(patch, 'PATCH', at(id), id, {
        body,
        ...(headers ? { headers } : {}),
      }),
    remove: (id: string) => call(remove, 'DELETE', at(id), id),
    publish: (
      id: string,
      headers: Record<string, string> = {},
      body: unknown = {},
    ) => call(publish, 'POST', at(id, '/publish'), id, { headers, body }),
    cancel: (id: string, body: unknown) =>
      call(cancel, 'POST', at(id, '/cancel'), id, { body }),
  };
}

async function addUser(args: Args, role: string, fullName: string) {
  const id = randomUUID();
  const authUserId = randomUUID();
  const session = await args.provider.issueSession(authUserId);
  await args.ctx.db.insert(schema.appUser).values({
    id,
    authUserId,
    email: `${id}@fixture.test`,
    fullName,
    activatedAt: args.ctx.clock.now(),
  });
  await args.ctx.db.insert(schema.userRole).values({
    userId: id,
    role,
    verticalId: args.user.verticalId,
  });
  await args.ctx.db.insert(schema.userSession).values({
    userId: id,
    sessionId: session.sessionId,
    method: 'MAGIC_LINK',
    startedAt: args.ctx.clock.now(),
    lastSeenAt: args.ctx.clock.now(),
  });
  return { authUserId, sessionId: session.sessionId, aal: 'aal1' as const };
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
  return {
    positionId: position!.id,
    other: await addUser(args, 'HEAD_RECRUITER', 'Інший керівник'),
    hr: await addUser(args, 'HR', 'HR без прав автора'),
    lead: await addUser(args, 'TEAM_LEAD', 'Тімлід без прав автора'),
  };
}

const problemOf = async (response: Response) =>
  (await response.json()) as {
    code: string;
    errors?: { path: string; code: string }[];
  };

describe('Draft lifecycle over HTTP [STORY-VAC-01-3, D92, D98]', () => {
  it('edits with PATCH: partial body, version up, refusals for unknown keys, empty body, stale version and a missing CSRF header', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Чернетка — TikTok',
      });

      const saved = await mine.patch(draft.id, {
        expectedVersion: draft.version,
        title: 'Медіабаєр — Facebook',
        positionId,
        headcount: 2,
      });
      expect(saved.status).toBe(200);
      expect(saved.headers.get('cache-control')).toBe('private, no-store');
      expect((await saved.json()) as VacancyDetail).toMatchObject({
        status: 'DRAFT',
        title: 'Медіабаєр — Facebook',
        headcount: 2,
        version: draft.version + 1,
        position: { id: positionId },
      });

      const unknown = await mine.patch(draft.id, {
        expectedVersion: draft.version + 1,
        title: 'Нова назва',
        verticalId: randomUUID(),
      });
      expect(unknown.status).toBe(400);
      expect(await problemOf(unknown)).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'body', code: 'unrecognized_keys' }],
      });
      const empty = await mine.patch(draft.id, {
        expectedVersion: draft.version + 1,
      });
      expect(empty.status).toBe(400);
      const stale = await mine.patch(draft.id, {
        expectedVersion: draft.version,
        title: 'Застаріла вкладка',
      });
      expect(stale.status).toBe(409);
      expect(await problemOf(stale)).toMatchObject({ code: 'STALE_STATE' });
      const noCsrf = await mine.patch(
        draft.id,
        { expectedVersion: draft.version + 1, title: 'Без CSRF' },
        { 'x-csrf-protection': '0' },
      );
      expect(noCsrf.status).toBe(403);
    });
  });

  it('publishes with an Idempotency-Key: required, replayed, and a second key is a conflict', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Чернетка до публікації',
        positionId,
      });
      const version = { expectedVersion: draft.version };
      const missing = await mine.publish(draft.id, {}, version);
      expect(missing.status).toBe(400);
      expect(await problemOf(missing)).toMatchObject({
        errors: [{ path: 'header.Idempotency-Key', code: 'invalid_key' }],
      });

      const publishKey = randomUUID();
      const withKey = { 'idempotency-key': publishKey };
      const unversioned = await mine.publish(draft.id, withKey, {});
      expect(unversioned.status).toBe(400);
      expect(await problemOf(unversioned)).toMatchObject({
        errors: [{ path: 'body.expectedVersion', code: 'invalid_type' }],
      });
      const stale = await mine.publish(
        draft.id,
        { 'idempotency-key': randomUUID() },
        { expectedVersion: draft.version + 1 },
      );
      expect(stale.status).toBe(409);
      expect(await problemOf(stale)).toMatchObject({ code: 'STALE_STATE' });

      const opened = await mine.publish(draft.id, withKey, version);
      expect(opened.status).toBe(200);
      expect((await opened.json()) as VacancyDetail).toMatchObject({
        id: draft.id,
        status: 'OPEN',
        openedAt: args.ctx.clock.now().toISOString(),
      });
      const replay = await mine.publish(draft.id, withKey, version);
      expect(replay.status).toBe(200);
      const second = await mine.publish(
        draft.id,
        { 'idempotency-key': randomUUID() },
        version,
      );
      expect(second.status).toBe(409);
      expect(await problemOf(second)).toMatchObject({
        code: 'VACANCY_NOT_DRAFT',
      });
      const edited = await mine.patch(draft.id, {
        expectedVersion: 99,
        title: 'Після публікації',
      });
      expect(edited.status).toBe(409);
    });
  });

  it('cancels with a reason and keeps the cancelled draft private; deletes and then answers 404', async () => {
    await fixture.run(async (args) => {
      await setup(args);
      const mine = routes(args, args.identity);
      const toCancel = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'До скасування',
      });
      const noReason = await mine.cancel(toCancel.id, {});
      expect(noReason.status).toBe(400);
      const cancelled = await mine.cancel(toCancel.id, { reason: 'Дубль' });
      expect(cancelled.status).toBe(200);
      expect((await cancelled.json()) as VacancyDetail).toMatchObject({
        status: 'CANCELLED',
        openedAt: null,
      });
      expect((await mine.remove(toCancel.id)).status).toBe(409);

      const toDelete = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'До видалення',
      });
      const deleted = await mine.remove(toDelete.id);
      expect(deleted.status).toBe(200);
      expect(await deleted.json()).toEqual({ id: toDelete.id });
      for (const response of [
        await mine.remove(toDelete.id),
        await mine.publish(
          toDelete.id,
          { 'idempotency-key': randomUUID() },
          { expectedVersion: 1 },
        ),
        await mine.cancel(toDelete.id, { reason: 'Пізно' }),
        await mine.patch(toDelete.id, { expectedVersion: 1, title: 'Пізно' }),
      ])
        expect(response.status).toBe(404);
    });
  });

  it('answers 404 to another author, a Head Recruiter of the same vertical included, and for a malformed id, without changing the draft', async () => {
    await fixture.run(async (args) => {
      const { other } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Чужа чернетка',
      });
      const theirs = routes(args, other);
      for (const response of [
        await theirs.patch(draft.id, {
          expectedVersion: draft.version,
          title: 'Підміна',
        }),
        await theirs.publish(
          draft.id,
          { 'idempotency-key': randomUUID() },
          { expectedVersion: draft.version },
        ),
        await theirs.cancel(draft.id, { reason: 'Підміна' }),
        await theirs.remove(draft.id),
        await mine.remove('not-a-uuid'),
      ]) {
        expect(response.status).toBe(404);
        expect(await problemOf(response)).toMatchObject({ code: 'NOT_FOUND' });
      }
      const still = await mine.patch(draft.id, {
        expectedVersion: draft.version,
        title: 'Моя назва',
      });
      expect(still.status).toBe(200);
    });
  });

  it('answers 404 to a caller without an authoring role before any input is read, so a bad body or id tells HR nothing', async () => {
    await fixture.run(async (args) => {
      const { hr } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Чернетка для HR',
      });
      const asHr = routes(args, hr);
      for (const response of [
        await asHr.patch(draft.id, {
          expectedVersion: draft.version,
          title: 'Підміна',
        }),
        await asHr.patch(draft.id, {
          title: 'Без версії',
          verticalId: randomUUID(),
        }),
        await asHr.publish(draft.id, { 'idempotency-key': randomUUID() }, {}),
        await asHr.cancel(draft.id, {}),
        await asHr.remove(draft.id),
        await asHr.remove(randomUUID()),
      ]) {
        expect(response.status).toBe(404);
        expect(await problemOf(response)).toMatchObject({ code: 'NOT_FOUND' });
      }
    });
  });

  it('answers 404 to a Team Lead, who holds vacancy.create but authors nothing, whatever the body, the key or the id', async () => {
    await fixture.run(async (args) => {
      const { lead } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Чернетка для тімліда',
      });
      const asLead = routes(args, lead);
      for (const response of [
        await asLead.patch(draft.id, {
          expectedVersion: draft.version,
          title: 'Підміна',
        }),
        await asLead.patch(draft.id, {
          title: 'Без версії',
          verticalId: randomUUID(),
        }),
        await asLead.publish(
          draft.id,
          { 'idempotency-key': randomUUID() },
          { expectedVersion: draft.version },
        ),
        await asLead.publish(draft.id, {}, { expectedVersion: draft.version }),
        await asLead.publish(draft.id, { 'idempotency-key': randomUUID() }, {}),
        await asLead.cancel(draft.id, { reason: 'Підміна' }),
        await asLead.cancel(draft.id, {}),
        await asLead.remove(draft.id),
        await asLead.remove('not-a-uuid'),
      ]) {
        expect(response.status).toBe(404);
        expect(await problemOf(response)).toMatchObject({ code: 'NOT_FOUND' });
      }
      const still = await mine.patch(draft.id, {
        expectedVersion: draft.version,
        title: 'Моя назва',
      });
      expect(still.status).toBe(200);
    });
  });
});
