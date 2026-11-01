import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createVerticalSchema,
  settingsVerticalSchema,
} from '../../lib/schemas/vertical';
import { loadAuthContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import {
  createVertical,
  listSettingsVerticals,
  renameVertical,
} from '../../server/services/vertical';
import { createAuthFixture } from '../support/auth-fixture';
import { TEST_APP_URL } from '../support/auth-fakes';
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

type FixtureArgs = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];

async function request(
  args: FixtureArgs,
  {
    admin,
    aal,
    verified,
  }: { admin: boolean; aal: 'aal1' | 'aal2'; verified: boolean },
) {
  if (admin)
    await args.ctx.db
      .insert(schema.userRole)
      .values({ userId: args.user.id, role: 'ADMIN', verticalId: null });
  if (verified) await args.markMfaVerified();
  const identity = { ...args.identity, aal };
  const auth = await loadAuthContext(args.ctx.db, identity, args.ctx.clock);
  return { ...args.ctx, auth, identity };
}

const adminRequest = (args: FixtureArgs) =>
  request(args, { admin: true, aal: 'aal2', verified: true });

describe('Settings → Вертикалі: create, rename, list [ROLE-03, STORY-ROLE-03-1, D34]', () => {
  it('creates a vertical with audit and vertical.created, then lists it with active user counts', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const created = await createVertical(ctx, { name: '  Нутра  ' });
      expect(created).toMatchObject({
        name: 'Нутра',
        usersCount: 0,
        version: 1,
      });
      const [audit] = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.action, 'vertical.created'),
            eq(schema.auditLog.entityId, created.id),
          ),
        );
      expect(audit).toMatchObject({
        actorId: args.user.id,
        entityType: 'vertical',
        after: { name: 'Нутра' },
      });
      const events = await ctx.db
        .select()
        .from(schema.entityEvent)
        .where(eq(schema.entityEvent.subjectId, created.id));
      expect(events.map((event) => [event.type, event.verticalId])).toEqual([
        ['vertical.created', created.id],
      ]);

      const inactiveId = randomUUID();
      await ctx.db.insert(schema.appUser).values({
        id: inactiveId,
        email: `${inactiveId}@fixture.test`,
        fullName: 'Деактивований',
        isActive: false,
        deactivatedAt: ctx.clock.now(),
      });
      await ctx.db.insert(schema.userRole).values([
        {
          userId: inactiveId,
          role: 'RECRUITER',
          verticalId: args.user.verticalId,
        },
        { userId: args.user.id, role: 'HR', verticalId: args.user.verticalId },
      ]);
      const { items } = await listSettingsVerticals(ctx);
      const own = items.find((item) => item.id === args.user.verticalId);
      expect(own?.usersCount).toBe(1);
      expect(items.find((item) => item.id === created.id)?.usersCount).toBe(0);
      for (const item of items) settingsVerticalSchema.parse(item);
    });
  });

  it('renames with the expected version, keeps old→new in audit, and skips writes for the same name', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const created = await createVertical(ctx, { name: 'Нутра' });
      const renamed = await renameVertical(ctx, created.id, {
        name: 'Нутра EU',
        expectedVersion: 1,
      });
      expect(renamed).toMatchObject({ name: 'Нутра EU', version: 2 });
      const unchanged = await renameVertical(ctx, created.id, {
        name: 'Нутра EU',
        expectedVersion: 2,
      });
      expect(unchanged.version).toBe(2);
      const audits = await ctx.db
        .select()
        .from(schema.auditLog)
        .where(
          and(
            eq(schema.auditLog.action, 'vertical.renamed'),
            eq(schema.auditLog.entityId, created.id),
          ),
        );
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        before: { name: 'Нутра' },
        after: { name: 'Нутра EU' },
      });
      const events = await ctx.db
        .select({ type: schema.entityEvent.type })
        .from(schema.entityEvent)
        .where(eq(schema.entityEvent.subjectId, created.id));
      expect(events.map((event) => event.type)).toEqual([
        'vertical.created',
        'vertical.renamed',
      ]);
    });
  });

  it('answers 409 STALE_STATE for an outdated version and 404 for an unknown vertical', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const created = await createVertical(ctx, { name: 'Нутра' });
      await renameVertical(ctx, created.id, {
        name: 'Нутра 2',
        expectedVersion: 1,
      });
      await expect(
        renameVertical(ctx, created.id, {
          name: 'Нутра 3',
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ status: 409, code: 'STALE_STATE' });
      await expect(
        renameVertical(ctx, randomUUID(), {
          name: 'Нутра 3',
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    });
  });

  it.each([
    ['', 'empty'],
    ['Н', 'one character'],
    ['Н'.repeat(51), '51 characters'],
  ])('rejects the name %#: %s', async (name) => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      await expect(createVertical(ctx, { name })).rejects.toMatchObject({
        name: 'ZodError',
      });
      const created = await createVertical(ctx, { name: 'Н'.repeat(50) });
      expect(created.name).toHaveLength(50);
    });
  });

  it('answers 409 VERTICAL_NAME_TAKEN for a case-insensitive duplicate through the API', async () => {
    await fixture.run(async (args) => {
      await args.ctx.db
        .insert(schema.userRole)
        .values({ userId: args.user.id, role: 'ADMIN', verticalId: null });
      await args.markMfaVerified();
      const defineRoute = createRouteFactory({
        db: () => args.ctx.db,
        clock: args.ctx.clock,
        appUrl: () => TEST_APP_URL,
        registry: createApiRegistry(),
        verifyIdentity: async () => ({ ...args.identity, aal: 'aal2' }),
      });
      const post = defineRoute(
        {
          method: 'POST',
          path: '/verticals',
          operationId: 'createVertical',
          summary: 'Create a vertical',
          tags: ['Verticals'],
          body: createVerticalSchema,
          response: settingsVerticalSchema,
          successStatus: 201,
          errors: [400, 404, 409],
        },
        (ctx, { body }) => createVertical(ctx, body),
      );
      const send = (name: string) =>
        post(
          new Request(`${TEST_APP_URL}/api/v1/verticals`, {
            method: 'POST',
            headers: {
              origin: TEST_APP_URL,
              'content-type': 'application/json',
              'x-csrf-protection': '1',
            },
            body: JSON.stringify({ name }),
          }),
          { params: Promise.resolve({}) },
        );
      expect((await send('Нутра')).status).toBe(201);
      const duplicate = await send('нутра');
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toMatchObject({
        code: 'VERTICAL_NAME_TAKEN',
      });
      const invalid = await send('Н');
      expect(invalid.status).toBe(400);
    });
  });

  it.each([
    [
      'a Recruiter',
      { admin: false, aal: 'aal2', verified: true },
      404,
      'NOT_FOUND',
    ],
    [
      'an aal1 Admin',
      { admin: true, aal: 'aal1', verified: false },
      401,
      'MFA_REQUIRED',
    ],
    [
      'an Admin whose aal2 was not verified by the app',
      { admin: true, aal: 'aal2', verified: false },
      401,
      'MFA_REQUIRED',
    ],
  ] as const)(
    'denies %s on every vertical settings action',
    async (_who, access, status, code) => {
      await fixture.run(async (args) => {
        const ctx = await request(args, access);
        const denied = { status, code };
        await expect(listSettingsVerticals(ctx)).rejects.toMatchObject(denied);
        await expect(
          createVertical(ctx, { name: 'Нутра' }),
        ).rejects.toMatchObject(denied);
        await expect(
          renameVertical(ctx, args.user.verticalId, {
            name: 'Нутра',
            expectedVersion: 1,
          }),
        ).rejects.toMatchObject(denied);
        const [unchanged] = await ctx.db
          .select({ name: schema.vertical.name })
          .from(schema.vertical)
          .where(eq(schema.vertical.id, args.user.verticalId));
        expect(unchanged?.name).toBe(`Вертикаль ${args.user.verticalId}`);
      });
    },
  );
});
