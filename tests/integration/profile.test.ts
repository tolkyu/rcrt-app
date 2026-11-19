import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { meSchema } from '../../lib/schemas/me';
import { updateMeSchema } from '../../lib/schemas/profile';
import type { VerifiedIdentity } from '../../server/context/identity';
import type { Database, Transaction } from '../../server/db';
import * as schema from '../../server/db/schema';
import { fixedClock } from '../../server/domain/clock';
import {
  createRouteFactory,
  type RouteLogEntry,
} from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import { updateMyProfile } from '../../server/services/profile';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const runtimeClient = connectTestDatabase(urls.runtime);
const db: Database = drizzle(runtimeClient, { schema });
const clock = fixedClock(new Date('2026-11-16T08:00:00.000Z'));
const APP_URL = 'http://localhost:3100';
const ROLLBACK = Symbol('rollback');
const ORIGINAL_NAME = 'Марія Шевченко';

const actors = {
  me: { id: randomUUID(), authUserId: randomUUID(), sessionId: randomUUID() },
  other: {
    id: randomUUID(),
    authUserId: randomUUID(),
    sessionId: randomUUID(),
  },
};
type Actor = keyof typeof actors;
const verticalId = randomUUID();
const identity = (actor: Actor): VerifiedIdentity => ({
  authUserId: actors[actor].authUserId,
  sessionId: actors[actor].sessionId,
  aal: 'aal1',
});

beforeAll(async () => {
  const startedAt = new Date(clock.now().getTime() - 60 * 60 * 1000);
  for (const actor of Object.values(actors)) {
    await admin`insert into auth.sessions (id, user_id, not_after, created_at)
      values (${actor.sessionId}, ${actor.authUserId}, null, ${startedAt})`;
  }
});

afterAll(async () => {
  await admin`delete from auth.sessions where id in ${admin(Object.values(actors).map((actor) => actor.sessionId))}`;
  await Promise.all([admin.end(), runtimeClient.end()]);
});

async function seed(tx: Transaction) {
  const suffix = randomUUID().slice(0, 8);
  await tx
    .insert(schema.vertical)
    .values({ id: verticalId, name: `QA Профіль ${suffix}` });
  await tx.insert(schema.appUser).values([
    {
      id: actors.me.id,
      authUserId: actors.me.authUserId,
      email: `me.${suffix}@fixture.test`,
      fullName: ORIGINAL_NAME,
    },
    {
      id: actors.other.id,
      authUserId: actors.other.authUserId,
      email: `other.${suffix}@fixture.test`,
      fullName: 'Андрій Бондар',
    },
  ]);
  await tx.insert(schema.userRole).values([
    { userId: actors.me.id, role: 'RECRUITER', verticalId },
    { userId: actors.other.id, role: 'RECRUITER', verticalId },
  ]);
  const startedAt = new Date(clock.now().getTime() - 60 * 60 * 1000);
  await tx.insert(schema.userSession).values(
    Object.values(actors).map((actor) => ({
      sessionId: actor.sessionId,
      userId: actor.id,
      method: 'MAGIC_LINK' as const,
      startedAt,
      lastSeenAt: startedAt,
    })),
  );
}

interface Harness {
  readonly tx: Transaction;
  readonly patch: (
    body: unknown,
    options?: { actor?: Actor | null; headers?: Record<string, string> },
  ) => Promise<{ response: Response; requestId: string }>;
}

/** PATCH /api/v1/me wired exactly as app/api/v1/me/route.ts, inside a rolled-back transaction. */
async function withProfileRoute(fn: (harness: Harness) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await seed(tx);
      const log: RouteLogEntry[] = [];
      const defineRoute = createRouteFactory({
        db: () => tx,
        clock,
        appUrl: () => APP_URL,
        registry: createApiRegistry(),
        onComplete: (entry) => log.push(entry),
        verifyIdentity: async (headers) => {
          const actor = headers.get('x-test-actor') as Actor | null;
          return actor ? identity(actor) : null;
        },
      });
      const route = defineRoute(
        {
          method: 'PATCH',
          path: '/me',
          operationId: 'updateMe',
          summary: 'Change own display name',
          tags: ['Profile'],
          body: updateMeSchema,
          response: meSchema,
          errors: [400],
        },
        (ctx, { body }) => updateMyProfile(ctx, body),
      );
      const patch: Harness['patch'] = async (body, options = {}) => {
        const actor = options.actor === undefined ? 'me' : options.actor;
        const headers = new Headers({
          origin: APP_URL,
          'content-type': 'application/json',
          'x-csrf-protection': '1',
          'user-agent': 'vitest',
          ...options.headers,
        });
        if (actor) headers.set('x-test-actor', actor);
        const response = await route(
          new Request(new URL('/api/v1/me', APP_URL), {
            method: 'PATCH',
            headers,
            body: typeof body === 'string' ? body : JSON.stringify(body),
          }),
          { params: Promise.resolve({}) },
        );
        return { response, requestId: log.at(-1)!.requestId };
      };
      await fn({ tx, patch });
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function userRow(tx: Transaction, actor: Actor) {
  const [row] = await tx
    .select({
      fullName: schema.appUser.fullName,
      version: schema.appUser.version,
      updatedAt: schema.appUser.updatedAt,
    })
    .from(schema.appUser)
    .where(eq(schema.appUser.id, actors[actor].id));
  return row!;
}

async function writesFor(tx: Transaction, requestId: string) {
  const [audits, events] = await Promise.all([
    tx
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.requestId, requestId)),
    tx
      .select()
      .from(schema.entityEvent)
      .where(eq(schema.entityEvent.requestId, requestId)),
  ]);
  return { audits, events };
}

const problem = async (response: Response) => {
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  return response.json();
};

describe('PATCH /api/v1/me: own display name [ROLE-05-6, AUD-1, HIST-03]', () => {
  it('collapses whitespace, saves the name and returns the updated /me', async () => {
    await withProfileRoute(async ({ tx, patch }) => {
      const before = await userRow(tx, 'me');
      const { response } = await patch({
        fullName: '   Марія \t  Коваленко-Шевченко  ',
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      const me = meSchema.parse(await response.json());
      expect(me.user).toMatchObject({
        id: actors.me.id,
        fullName: 'Марія Коваленко-Шевченко',
      });
      expect(me.roles).toEqual([
        {
          role: 'RECRUITER',
          vertical: expect.objectContaining({ id: verticalId }),
        },
      ]);
      expect(await userRow(tx, 'me')).toEqual({
        fullName: 'Марія Коваленко-Шевченко',
        version: before.version + 1,
        updatedAt: clock.now(),
      });
      expect((await userRow(tx, 'other')).fullName).toBe('Андрій Бондар');
    });
  });

  it('audits before/after with actor, user agent and request id', async () => {
    await withProfileRoute(async ({ tx, patch }) => {
      const { response, requestId } = await patch({
        fullName: 'Марія Коваленко',
      });
      expect(response.status).toBe(200);
      const { audits } = await writesFor(tx, requestId);
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorId: actors.me.id,
        actorKind: 'USER',
        action: 'user.profile_updated',
        result: 'SUCCESS',
        entityType: 'user',
        entityId: actors.me.id,
        before: { fullName: ORIGINAL_NAME },
        after: { fullName: 'Марія Коваленко' },
        details: null,
        userAgent: 'vitest',
        occurredAt: clock.now(),
      });
    });
  });

  it('emits user.profile_updated with {fields:["fullName"]}; old and new names live only in the PII side row', async () => {
    await withProfileRoute(async ({ tx, patch }) => {
      const { requestId } = await patch({ fullName: 'Марія Коваленко' });
      const { events } = await writesFor(tx, requestId);
      expect(events).toHaveLength(1);
      const event = events[0]!;
      expect(event).toMatchObject({
        type: 'user.profile_updated',
        actorId: actors.me.id,
        actorKind: 'USER',
        subjectType: 'app_user',
        subjectId: actors.me.id,
        verticalId: null,
        sensitivity: 'GENERAL',
        occurredAt: clock.now(),
        payload: { v: 1, fields: ['fullName'] },
      });
      expect(
        JSON.stringify(event, (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      ).not.toMatch(/Марія|Шевченко|Коваленко/);
      const pii = await tx
        .select({ data: schema.entityEventPii.data })
        .from(schema.entityEventPii)
        .where(eq(schema.entityEventPii.eventId, event.id));
      expect(pii).toEqual([
        {
          data: {
            fullName: { old: ORIGINAL_NAME, new: 'Марія Коваленко' },
          },
        },
      ]);
    });
  });

  it.each([
    ['the same name', ORIGINAL_NAME],
    ['the same name with extra whitespace', `  Марія    Шевченко `],
  ])('writes nothing for %s', async (_case, fullName) => {
    await withProfileRoute(async ({ tx, patch }) => {
      const before = await userRow(tx, 'me');
      const { response, requestId } = await patch({ fullName });
      expect(response.status).toBe(200);
      expect(meSchema.parse(await response.json()).user.fullName).toBe(
        ORIGINAL_NAME,
      );
      expect(await userRow(tx, 'me')).toEqual(before);
      expect(await writesFor(tx, requestId)).toEqual({
        audits: [],
        events: [],
      });
      const anyEvent = await tx
        .select({ id: schema.entityEvent.id })
        .from(schema.entityEvent)
        .where(
          and(
            eq(schema.entityEvent.type, 'user.profile_updated'),
            eq(schema.entityEvent.subjectId, actors.me.id),
          ),
        );
      expect(anyEvent).toEqual([]);
    });
  });

  it('accepts exactly 120 characters', async () => {
    await withProfileRoute(async ({ tx, patch }) => {
      const name = 'я'.repeat(120);
      const { response } = await patch({ fullName: name });
      expect(response.status).toBe(200);
      expect((await userRow(tx, 'me')).fullName).toBe(name);
    });
  });

  it.each([
    ['an empty name', '', 'too_small'],
    ['a blank name', ' \t\n ', 'too_small'],
    ['121 characters', 'я'.repeat(121), 'too_big'],
    [
      '121 characters after collapsing',
      `${'я'.repeat(60)}   ${'я'.repeat(60)}`,
      'too_big',
    ],
  ])(
    'rejects %s with 400 and writes nothing',
    async (_case, fullName, code) => {
      await withProfileRoute(async ({ tx, patch }) => {
        const before = await userRow(tx, 'me');
        const { response, requestId } = await patch({ fullName });
        expect(await problem(response)).toMatchObject({
          status: 400,
          code: 'VALIDATION_FAILED',
          errors: [{ path: 'body.fullName', code }],
        });
        expect(await userRow(tx, 'me')).toEqual(before);
        expect(await writesFor(tx, requestId)).toEqual({
          audits: [],
          events: [],
        });
      });
    },
  );

  it.each([
    [
      'an email change (Admin-only, D44)',
      { fullName: 'Марія', email: 'x@demo' },
      'body',
    ],
    ['a missing name', {}, 'body.fullName'],
    ['a non-string name', { fullName: 42 }, 'body.fullName'],
  ])('rejects %s with 400', async (_case, body, path) => {
    await withProfileRoute(async ({ tx, patch }) => {
      const before = await userRow(tx, 'me');
      const { response } = await patch(body);
      const payload = await problem(response);
      expect(payload).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
      expect(
        payload.errors.map((error: { path: string }) => error.path),
      ).toContain(path);
      expect(await userRow(tx, 'me')).toEqual(before);
    });
  });

  it('requires a session and the CSRF transport header', async () => {
    await withProfileRoute(async ({ tx, patch }) => {
      const before = await userRow(tx, 'me');
      expect(
        await problem(
          (await patch({ fullName: 'Хтось' }, { actor: null })).response,
        ),
      ).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
      expect(
        await problem(
          (
            await patch(
              { fullName: 'Хтось' },
              { headers: { 'x-csrf-protection': '' } },
            )
          ).response,
        ),
      ).toMatchObject({ status: 403, code: 'CSRF_FORBIDDEN' });
      expect(await userRow(tx, 'me')).toEqual(before);
    });
  });

  it('changes only the caller: another user editing their name leaves mine intact', async () => {
    await withProfileRoute(async ({ tx, patch }) => {
      const { response } = await patch(
        { fullName: 'Андрій Бондаренко' },
        { actor: 'other' },
      );
      expect(meSchema.parse(await response.json()).user.id).toBe(
        actors.other.id,
      );
      expect((await userRow(tx, 'other')).fullName).toBe('Андрій Бондаренко');
      expect((await userRow(tx, 'me')).fullName).toBe(ORIGINAL_NAME);
    });
  });
});
