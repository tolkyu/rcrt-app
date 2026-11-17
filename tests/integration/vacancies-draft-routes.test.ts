import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import { cancelVacancySchema } from '../../lib/schemas/vacancy-cancel';
import {
  createVacancySchema,
  patchVacancySchema,
  publishDraftSchema,
  vacancyDeletedSchema,
  vacancyDetailSchema,
  VACANCY_WRITE_RATE_LIMIT,
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
      const freeText = await mine.patch(draft.id, {
        expectedVersion: draft.version + 1,
        seniority: 'Senior',
      });
      expect(freeText.status).toBe(400);
      expect(await problemOf(freeText)).toMatchObject({
        code: 'VALIDATION_FAILED',
        errors: [{ path: 'body.seniority', code: 'invalid_value' }],
      });
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
      expect(await problemOf(edited)).toMatchObject({
        code: 'VACANCY_NOT_DRAFT',
      });
    });
  });

  it('answers 403 FORBIDDEN to a Recruiter who sets a Team Lead or the probation length, then clears optional fields with null at the unchanged version', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Чернетка з умовами',
        positionId,
        location: 'Київ',
        seniority: 'Мідл',
      });
      for (const rest of [
        { teamLeadId: randomUUID() },
        { probationDays: 60 },
      ]) {
        const refused = await mine.patch(draft.id, {
          expectedVersion: draft.version,
          ...rest,
        });
        expect(refused.status).toBe(403);
        expect(await problemOf(refused)).toMatchObject({ code: 'FORBIDDEN' });
      }
      const cleared = await mine.patch(draft.id, {
        expectedVersion: draft.version,
        location: null,
        seniority: null,
        positionId: null,
      });
      expect(cleared.status).toBe(200);
      expect((await cleared.json()) as VacancyDetail).toMatchObject({
        location: null,
        seniority: null,
        position: null,
        version: draft.version + 1,
      });
    });
  });

  it('cancels with a reason and keeps the cancelled draft private; deletes a draft and a cancelled draft, then answers 404', async () => {
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
      const removed = await mine.remove(toCancel.id);
      expect(removed.status).toBe(200);
      expect(await removed.json()).toEqual({ id: toCancel.id });
      expect((await mine.remove(toCancel.id)).status).toBe(404);

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

describe('Publish over HTTP, as the optimistic list action sends it [STORY-VAC-01-1, D98]', () => {
  it('replays the stored answer byte for byte for a lost-answer retry, even after the position was deactivated', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Повтор після втраченої відповіді',
        positionId,
      });
      const headers = { 'idempotency-key': randomUUID() };
      const body = { expectedVersion: draft.version };
      const first = await mine.publish(draft.id, headers, body);
      expect(first.status).toBe(200);
      const opened = (await first.json()) as VacancyDetail;
      await args.ctx.db
        .update(schema.position)
        .set({ isActive: false })
        .where(eq(schema.position.id, positionId));
      const replay = await mine.publish(draft.id, headers, body);
      expect(replay.status).toBe(200);
      expect((await replay.json()) as VacancyDetail).toEqual(opened);
      const reused = await mine.publish(draft.id, headers, {
        expectedVersion: draft.version + 1,
      });
      expect(reused.status).toBe(409);
      expect(await problemOf(reused)).toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    });
  });

  it('answers 409 POSITION_INACTIVE and 409 STALE_STATE without storing the key, so the same key publishes after the fix', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Посаду деактивовано',
        positionId,
      });
      const headers = { 'idempotency-key': randomUUID() };
      await args.ctx.db
        .update(schema.position)
        .set({ isActive: false })
        .where(eq(schema.position.id, positionId));
      const inactive = await mine.publish(draft.id, headers, {
        expectedVersion: draft.version,
      });
      expect(inactive.status).toBe(409);
      expect(await problemOf(inactive)).toMatchObject({
        code: 'POSITION_INACTIVE',
      });
      await args.ctx.db
        .update(schema.position)
        .set({ isActive: true })
        .where(eq(schema.position.id, positionId));

      const edited = await mine.patch(draft.id, {
        expectedVersion: draft.version,
        headcount: 3,
      });
      expect(edited.status).toBe(200);
      const stale = await mine.publish(draft.id, headers, {
        expectedVersion: draft.version,
      });
      expect(stale.status).toBe(409);
      expect(await problemOf(stale)).toMatchObject({ code: 'STALE_STATE' });

      const opened = await mine.publish(draft.id, headers, {
        expectedVersion: draft.version + 1,
      });
      expect(opened.status).toBe(200);
      expect((await opened.json()) as VacancyDetail).toMatchObject({
        status: 'OPEN',
        headcount: 3,
      });
    });
  });

  it('answers 409 VACANCY_NOT_DRAFT, not STALE_STATE, to a publish of a cancelled draft sent with an old version', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Скасована в іншій вкладці',
        positionId,
      });
      expect((await mine.cancel(draft.id, { reason: 'Дубль' })).status).toBe(
        200,
      );
      const refused = await mine.publish(
        draft.id,
        { 'idempotency-key': randomUUID() },
        { expectedVersion: draft.version },
      );
      expect(refused.status).toBe(409);
      expect(await problemOf(refused)).toMatchObject({
        code: 'VACANCY_NOT_DRAFT',
      });
    });
  });

  it('answers 429 RATE_LIMITED to a publish once the write budget is spent', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Ліміт записів',
        positionId,
      });
      for (let n = 1; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        expect(
          (
            await mine.patch(draft.id, {
              expectedVersion: draft.version,
              title: draft.title,
            })
          ).status,
        ).toBe(200);
      const limited = await mine.publish(
        draft.id,
        { 'idempotency-key': randomUUID() },
        { expectedVersion: draft.version },
      );
      expect(limited.status).toBe(429);
      expect(await problemOf(limited)).toMatchObject({ code: 'RATE_LIMITED' });
    });
  });
});

describe('Cancel and delete over HTTP, as the dialogs send them [STORY-VAC-01-3, D111, D112, D113]', () => {
  const stored = async (args: Args, id: string) => {
    const [row] = await args.ctx.db
      .select({
        status: schema.vacancy.status,
        version: schema.vacancy.version,
        deletedAt: schema.vacancy.deletedAt,
      })
      .from(schema.vacancy)
      .where(eq(schema.vacancy.id, id));
    return row!;
  };

  it('refuses a reason with control, zero-width or bidi characters, or over 500 characters after normalising, and leaves the draft untouched', async () => {
    await fixture.run(async (args) => {
      await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Причина з сенсом',
      });
      const before = await stored(args, draft.id);
      for (const [reason, code] of [
        ['Дубль\u0000', 'custom'],
        ['Дубль\u000B', 'custom'],
        ['Дубль\u200B', 'custom'],
        ['Дубль\u202E', 'custom'],
        ['\u2028', ['custom', 'too_small']],
        ['   \n \n  ', 'too_small'],
        ['а'.repeat(501), 'too_big'],
        [`${'а'.repeat(250)}\n${'б'.repeat(250)}`, 'too_big'],
      ] as const) {
        const refused = await mine.cancel(draft.id, { reason });
        expect(refused.status, JSON.stringify(reason)).toBe(400);
        expect((await problemOf(refused)).errors).toEqual(
          [code].flat().map((c) => ({ path: 'body.reason', code: c })),
        );
      }
      expect(await stored(args, draft.id)).toEqual(before);
    });
  });

  it('accepts 500 characters across lines, counts every break once and stores all blank lines', async () => {
    await fixture.run(async (args) => {
      await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Багаторядкова причина',
      });
      const cancelled = await mine.cancel(draft.id, {
        reason: ` ${'а'.repeat(249)} \r\n\r\n\r\n ${'б'.repeat(248)}\t`,
      });
      expect(cancelled.status).toBe(200);
      expect((await cancelled.json()) as VacancyDetail).toMatchObject({
        status: 'CANCELLED',
        openedAt: null,
      });
      const [pii] = await args.ctx.db
        .select({ data: schema.entityEventPii.data })
        .from(schema.entityEventPii)
        .innerJoin(
          schema.entityEvent,
          eq(schema.entityEvent.id, schema.entityEventPii.eventId),
        )
        .where(eq(schema.entityEvent.vacancyId, draft.id));
      expect(pii!.data).toEqual({
        reason: `${'а'.repeat(249)}\n\n\n${'б'.repeat(248)}`,
      });
    });
  });

  it('answers 409 VACANCY_NOT_DRAFT to a second cancel, then lets the author delete the cancelled draft, and 404 to another author for both', async () => {
    await fixture.run(async (args) => {
      const { other } = await setup(args);
      const mine = routes(args, args.identity);
      const theirs = routes(args, other);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Скасована і видалена',
      });
      expect((await mine.cancel(draft.id, { reason: 'Дубль' })).status).toBe(
        200,
      );
      const twice = await mine.cancel(draft.id, { reason: 'Ще раз' });
      expect(twice.status).toBe(409);
      expect(await problemOf(twice)).toMatchObject({
        code: 'VACANCY_NOT_DRAFT',
      });
      for (const response of [
        await theirs.cancel(draft.id, { reason: 'Чужа' }),
        await theirs.remove(draft.id),
      ]) {
        expect(response.status).toBe(404);
        expect(await problemOf(response)).toMatchObject({ code: 'NOT_FOUND' });
      }
      expect(await stored(args, draft.id)).toMatchObject({
        status: 'CANCELLED',
        deletedAt: null,
      });
      expect((await mine.remove(draft.id)).status).toBe(200);
    });
  });

  it('answers 409 VACANCY_NOT_DRAFT to a delete of a cancelled vacancy that was once OPEN and changes nothing', async () => {
    await fixture.run(async (args) => {
      const { positionId } = await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Була відкрита',
        positionId,
      });
      expect(
        (
          await mine.publish(
            draft.id,
            { 'idempotency-key': randomUUID() },
            { expectedVersion: draft.version },
          )
        ).status,
      ).toBe(200);
      await args.ctx.db
        .update(schema.vacancy)
        .set({
          status: 'CANCELLED',
          closedAt: new Date(),
          cancelledAt: new Date(),
        })
        .where(eq(schema.vacancy.id, draft.id));
      const before = await stored(args, draft.id);
      const refused = await mine.remove(draft.id);
      expect(refused.status).toBe(409);
      expect(await problemOf(refused)).toMatchObject({
        code: 'VACANCY_NOT_DRAFT',
      });
      expect(await stored(args, draft.id)).toEqual(before);
    });
  });

  it('answers 429 RATE_LIMITED to a cancel and a delete once the write budget is spent, and writes nothing', async () => {
    await fixture.run(async (args) => {
      await setup(args);
      const mine = routes(args, args.identity);
      const draft = await mine.createDraft({
        verticalId: args.user.verticalId,
        title: 'Ліміт скасування',
      });
      for (let n = 1; n < VACANCY_WRITE_RATE_LIMIT.perUser; n += 1)
        expect(
          (
            await mine.patch(draft.id, {
              expectedVersion: draft.version,
              title: draft.title,
            })
          ).status,
        ).toBe(200);
      const before = await stored(args, draft.id);
      for (const response of [
        await mine.cancel(draft.id, { reason: 'Дубль' }),
        await mine.remove(draft.id),
      ]) {
        expect(response.status).toBe(429);
        expect(await problemOf(response)).toMatchObject({
          code: 'RATE_LIMITED',
        });
        expect(response.headers.get('Retry-After')).not.toBeNull();
      }
      expect(await stored(args, draft.id)).toEqual(before);
    });
  });
});
