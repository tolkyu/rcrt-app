import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { appendEvent, emitChange } from '../../server/events/index';
import { writeAudit } from '../../server/audit/index';
import { can } from '../../server/authz/can';
import { scopeWhere, userDirectoryScope } from '../../server/authz/scopes';
import type { VerticalId } from '../../server/authz/types';
import type { VerifiedIdentity } from '../../server/context/identity';
import {
  loadAuthContext,
  resolveRequestContext,
  type RequestContext,
  type SystemContext,
} from '../../server/context/request-context';
import type { Database, Transaction } from '../../server/db';
import * as schema from '../../server/db/schema';
import { fixedClock } from '../../server/domain/clock';
import {
  createRouteFactory,
  type RouteLogEntry,
} from '../../server/http/define-route';
import {
  ConflictError,
  NotFoundError,
  RateLimitedError,
} from '../../server/http/errors';
import {
  buildOpenApiDocument,
  createApiRegistry,
} from '../../server/http/openapi';
import { getMe } from '../../server/services/me';
import { listVisibleVerticals } from '../../server/services/vertical';
import { meSchema } from '../../lib/schemas/me';
import { verticalListSchema } from '../../lib/schemas/vertical';
import { connectTestDatabase, testDatabaseUrls } from './database';

const urls = testDatabaseUrls();
const admin = connectTestDatabase(urls.migration);
const runtimeClient = connectTestDatabase(urls.runtime);
const db: Database = drizzle(runtimeClient, { schema });
const clock = fixedClock(new Date('2026-11-16T08:00:00.000Z'));
const APP_URL = 'http://localhost:3100';
const ROLLBACK = Symbol('rollback');

type Actor =
  | 'admin'
  | 'headA'
  | 'multi'
  | 'recruiterB'
  | 'finance'
  | 'inactive'
  | 'noRole'
  | 'expired';
const actors: Record<
  Actor,
  { id: string; authUserId: string; sessionId: string }
> = Object.fromEntries(
  (
    [
      'admin',
      'headA',
      'multi',
      'recruiterB',
      'finance',
      'inactive',
      'noRole',
      'expired',
    ] as const
  ).map((name) => [
    name,
    { id: randomUUID(), authUserId: randomUUID(), sessionId: randomUUID() },
  ]),
) as Record<Actor, { id: string; authUserId: string; sessionId: string }>;
const verticalA = randomUUID() as VerticalId;
const verticalB = randomUUID() as VerticalId;
const identity = (
  actor: Actor,
  aal: 'aal1' | 'aal2' = 'aal1',
): VerifiedIdentity => ({
  authUserId: actors[actor].authUserId,
  sessionId: actors[actor].sessionId,
  aal,
});

beforeAll(async () => {
  for (const [name, actor] of Object.entries(actors)) {
    await admin`insert into auth.sessions (id, user_id, not_after) values (${actor.sessionId}, ${actor.authUserId},
      ${name === 'expired' ? '2026-11-16T07:59:59Z' : null})`;
  }
});

afterAll(async () => {
  await admin`delete from auth.sessions where id in ${admin(Object.values(actors).map((actor) => actor.sessionId))}`;
  await Promise.all([admin.end(), runtimeClient.end()]);
});

/** Every scenario runs in a transaction that is rolled back, so the shared test database stays clean. */
async function inRollback(fn: (tx: Transaction) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await seed(tx);
      await fn(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

async function seed(tx: Transaction) {
  const suffix = randomUUID().slice(0, 8);
  await tx.insert(schema.vertical).values([
    { id: verticalA, name: `QA Альфа ${suffix}` },
    { id: verticalB, name: `QA Бета ${suffix}` },
  ]);
  await tx.insert(schema.appUser).values(
    Object.entries(actors).map(([name, actor]) => ({
      id: actor.id,
      authUserId: actor.authUserId,
      email: `${name.toLowerCase()}.${suffix}@fixture.test`,
      fullName: `Тест ${name}`,
      ...(name === 'inactive'
        ? { isActive: false, deactivatedAt: clock.now() }
        : {}),
    })),
  );
  await tx.insert(schema.userRole).values([
    { userId: actors.admin.id, role: 'ADMIN', verticalId: null },
    { userId: actors.headA.id, role: 'HEAD_RECRUITER', verticalId: verticalA },
    { userId: actors.multi.id, role: 'HEAD_RECRUITER', verticalId: verticalA },
    { userId: actors.multi.id, role: 'RECRUITER', verticalId: verticalB },
    { userId: actors.recruiterB.id, role: 'RECRUITER', verticalId: verticalB },
    { userId: actors.finance.id, role: 'FINANCE', verticalId: null },
    { userId: actors.inactive.id, role: 'RECRUITER', verticalId: verticalA },
    { userId: actors.expired.id, role: 'RECRUITER', verticalId: verticalA },
  ]);
}

async function contextFor(
  tx: Transaction,
  actor: Actor,
  aal: 'aal1' | 'aal2' = 'aal1',
): Promise<RequestContext> {
  return resolveRequestContext(
    { db: () => tx, clock, verifyIdentity: async () => identity(actor, aal) },
    new Headers({ 'user-agent': 'vitest', 'x-forwarded-for': '198.51.100.4' }),
  );
}

describe('Request context: one query for user, roles and session [VIS-01-1, DG-05]', () => {
  it('loads roles × verticals and compiles grants for the verified identity', async () => {
    await inRollback(async (tx) => {
      const auth = await loadAuthContext(tx, identity('multi'), clock);
      expect(auth.userId).toBe(actors.multi.id);
      expect(auth.roles).toHaveLength(2);
      expect(auth.grants.get('vertical.read')?.[0]?.verticalIds).toEqual(
        [verticalA, verticalB].sort(),
      );
      expect(auth.timezone).toBe('Europe/Kyiv');
    });
  });

  it.each([
    ['an unknown auth user', { authUserId: randomUUID() }, 'UNAUTHENTICATED'],
    [
      'a session of another user',
      { sessionId: actors.admin.sessionId },
      'SESSION_EXPIRED',
    ],
    ['a missing session', { sessionId: randomUUID() }, 'SESSION_EXPIRED'],
  ] as const)('rejects %s', async (_case, override, code) => {
    await inRollback(async (tx) => {
      await expect(
        loadAuthContext(tx, { ...identity('headA'), ...override }, clock),
      ).rejects.toMatchObject({
        status: 401,
        code,
      });
    });
  });

  it('rejects an ended session and a deactivated user even with a valid token', async () => {
    await inRollback(async (tx) => {
      await expect(
        loadAuthContext(tx, identity('expired'), clock),
      ).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
      await expect(
        loadAuthContext(tx, identity('inactive'), clock),
      ).rejects.toMatchObject({ code: 'USER_DEACTIVATED' });
    });
  });

  it('withholds Admin grants without aal2 and applies them with aal2 [MFA-02]', async () => {
    await inRollback(async (tx) => {
      expect(
        (await loadAuthContext(tx, identity('admin', 'aal1'), clock))
          .mfaRequired,
      ).toBe(true);
      const elevated = await loadAuthContext(
        tx,
        identity('admin', 'aal2'),
        clock,
      );
      expect(elevated.mfaRequired).toBe(false);
      expect(elevated.grants.get('audit.read')?.[0]?.scope).toEqual({
        kind: 'GLOBAL',
      });
    });
  });

  it('fails closed when no identity verifier is configured', async () => {
    await inRollback(async (tx) => {
      await expect(
        resolveRequestContext({ db: () => tx, clock }, new Headers()),
      ).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });
  });
});

describe('Scoped lists never leak across verticals [VIS-02-1]', () => {
  it('returns only verticals where the caller holds a role; Admin sees all; Finance gets 404', async () => {
    await inRollback(async (tx) => {
      const names = async (actor: Actor, aal: 'aal1' | 'aal2' = 'aal1') =>
        (
          await listVisibleVerticals(await contextFor(tx, actor, aal))
        ).items.map((item) => item.id);
      expect(await names('headA')).toEqual([verticalA]);
      expect(await names('recruiterB')).toEqual([verticalB]);
      expect((await names('multi')).sort()).toEqual(
        [verticalA, verticalB].sort(),
      );
      expect(await names('admin', 'aal2')).toEqual(
        expect.arrayContaining([verticalA, verticalB]),
      );
      await expect(names('finance', 'aal2')).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(names('noRole')).rejects.toBeInstanceOf(NotFoundError);
      await expect(names('admin', 'aal1')).rejects.toMatchObject({
        code: 'MFA_REQUIRED',
      });
    });
  });

  it('CT-01: list membership equals can(read) for every user and vertical', async () => {
    await inRollback(async (tx) => {
      const all = await tx
        .select({ id: schema.vertical.id })
        .from(schema.vertical);
      for (const actor of ['admin', 'headA', 'multi', 'recruiterB'] as const) {
        const ctx = await contextFor(tx, actor, 'aal2');
        const listed = new Set(
          (await listVisibleVerticals(ctx)).items.map((item) => item.id),
        );
        for (const { id } of all) {
          expect(listed.has(id), `${actor} ${id}`).toBe(
            can(ctx.auth, 'vertical.read', {
              type: 'vertical',
              id: id as VerticalId,
            }),
          );
        }
      }
    });
  });

  it('VIS2-07: the user directory predicate returns only users of the caller verticals', async () => {
    await inRollback(async (tx) => {
      const directory = async (actor: Actor) => {
        const ctx = await contextFor(tx, actor);
        const rows = await tx
          .select({ id: schema.appUser.id })
          .from(schema.appUser)
          .where(
            scopeWhere(ctx.auth, 'user.directory.read', userDirectoryScope),
          );
        return new Set(rows.map((row) => row.id));
      };
      const forHead = await directory('headA');
      expect(forHead.has(actors.multi.id)).toBe(true);
      expect(forHead.has(actors.headA.id)).toBe(true);
      for (const hidden of [
        'recruiterB',
        'finance',
        'admin',
        'noRole',
      ] as const) {
        expect(forHead.has(actors[hidden].id), hidden).toBe(false);
      }
      expect((await directory('recruiterB')).has(actors.headA.id)).toBe(false);
    });
  });
});

describe('Audit, events and change feed are written in the caller transaction [AUD-1, HIST-03-1, DG-11]', () => {
  it('writes actor, IP, UA, request id, diff and PII side row; rollback leaves nothing', async () => {
    let ids: { audit: bigint; event: bigint; requestId: string } | null = null;
    await inRollback(async (tx) => {
      const ctx = {
        ...(await contextFor(tx, 'headA')),
        mutationId: randomUUID(),
      };
      const audit = await writeAudit(tx, ctx, {
        action: 'vertical.renamed',
        entityType: 'vertical',
        entityId: verticalA,
        before: { name: 'Стара' },
        after: { name: 'Нова' },
      });
      const event = await appendEvent(tx, ctx, {
        type: 'vertical.renamed',
        subjectType: 'vertical',
        subjectId: verticalA,
        verticalId: verticalA,
        payload: { field: 'name' },
        pii: { old: 'Стара', new: 'Нова' },
      });
      await emitChange(tx, ctx, {
        entityType: 'vertical',
        entityId: verticalA,
        kind: 'updated',
        topic: { verticalId: verticalA },
      });
      ids = { audit, event, requestId: ctx.requestId };

      const [auditRow] = await tx
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.id, audit));
      expect(auditRow).toMatchObject({
        actorId: actors.headA.id,
        actorKind: 'USER',
        action: 'vertical.renamed',
        result: 'SUCCESS',
        ip: '198.51.100.4',
        userAgent: 'vitest',
        requestId: ctx.requestId,
        before: { name: 'Стара' },
        after: { name: 'Нова' },
        occurredAt: clock.now(),
      });
      const [eventRow] = await tx
        .select()
        .from(schema.entityEvent)
        .where(eq(schema.entityEvent.id, event));
      expect(eventRow).toMatchObject({
        type: 'vertical.renamed',
        payload: { v: 1, field: 'name' },
        sensitivity: 'GENERAL',
      });
      const [pii] = await tx
        .select()
        .from(schema.entityEventPii)
        .where(eq(schema.entityEventPii.eventId, event));
      expect(pii?.data).toEqual({ old: 'Стара', new: 'Нова' });
      const [feed] = await tx
        .select()
        .from(schema.changeFeed)
        .where(eq(schema.changeFeed.entityId, verticalA));
      expect(feed).toMatchObject({
        kind: 'updated',
        verticalId: verticalA,
        userId: null,
        mutationId: ctx.mutationId,
      });
    });
    expect(ids).not.toBeNull();
    const { audit, event, requestId } = ids!;
    const [left] = await db.execute<{
      audits: number;
      events: number;
      feed: number;
    }>(sql`select
      (select count(*)::int from app.audit_log where id = ${audit} or request_id = ${requestId}) as audits,
      (select count(*)::int from app.entity_event where id = ${event}) as events,
      (select count(*)::int from app.change_feed where entity_id = ${verticalA}) as feed`);
    expect(left).toEqual({ audits: 0, events: 0, feed: 0 });
  });

  it('a failing service transaction leaves no audit or event rows', async () => {
    await inRollback(async (tx) => {
      const ctx = await contextFor(tx, 'headA');
      await expect(
        tx.transaction(async (inner) => {
          await writeAudit(inner, ctx, {
            action: 'vertical.created',
            entityType: 'vertical',
            entityId: verticalA,
          });
          await appendEvent(inner, ctx, {
            type: 'vertical.created',
            subjectType: 'vertical',
            subjectId: verticalA,
            payload: {},
          });
          throw new ConflictError('STALE_STATE');
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      const [count] = await tx.execute<{ n: number }>(sql`select
        (select count(*)::int from app.audit_log where request_id = ${ctx.requestId}) +
        (select count(*)::int from app.entity_event where request_id = ${ctx.requestId}) as n`);
      expect(count?.n).toBe(0);
    });
  });

  it('records system actions without an actor and refuses PII in event payloads', async () => {
    await inRollback(async (tx) => {
      const system: SystemContext = {
        auth: null,
        db: tx,
        clock,
        requestId: randomUUID(),
        ip: null,
        userAgent: null,
        mutationId: null,
      };
      const id = await writeAudit(tx, system, {
        action: 'settings.updated',
        details: { job: 'stats-reconcile' },
      });
      const [row] = await tx
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.id, id));
      expect(row).toMatchObject({ actorId: null, actorKind: 'SYSTEM' });
      for (const payload of [
        { email: 'a@b.c' },
        { changes: [{ field: 'phone', old: '1', new: '2' }] },
      ] as Record<string, z.core.util.JSONType>[]) {
        await expect(
          appendEvent(tx, system, {
            type: 'user.profile_updated',
            subjectType: 'app_user',
            subjectId: actors.headA.id,
            payload,
          }),
        ).rejects.toBeInstanceOf(z.ZodError);
      }
      await expect(
        writeAudit(tx, system, { action: 'USER_INVITED' }),
      ).rejects.toBeInstanceOf(z.ZodError);
    });
  });
});

describe('defineRoute: transport checks, context and problem+json mapping [FND-4, FND-5, ADR-006]', () => {
  async function withRoutes(
    fn: (
      call: (
        route: string,
        init?: RequestInit & { actor?: Actor; aal?: 'aal1' | 'aal2' },
      ) => Promise<Response>,
      log: RouteLogEntry[],
    ) => Promise<void>,
  ) {
    await inRollback(async (tx) => {
      const log: RouteLogEntry[] = [];
      const registry = createApiRegistry();
      const defineRoute = createRouteFactory({
        db: () => tx,
        clock,
        appUrl: () => APP_URL,
        registry,
        onComplete: (entry) => log.push(entry),
        verifyIdentity: async (headers) => {
          const actor = headers.get('x-test-actor') as Actor | null;
          return actor
            ? identity(
                actor,
                (headers.get('x-test-aal') as 'aal1' | 'aal2') ?? 'aal1',
              )
            : null;
        },
      });
      const routes = {
        me: defineRoute(
          {
            method: 'GET',
            path: '/me',
            operationId: 'getMe',
            summary: 'me',
            tags: ['t'],
            response: meSchema,
            errors: [],
          },
          getMe,
        ),
        verticals: defineRoute(
          {
            method: 'GET',
            path: '/verticals',
            operationId: 'listVerticals',
            summary: 'v',
            tags: ['t'],
            response: verticalListSchema,
            errors: [404],
          },
          listVisibleVerticals,
        ),
        page: defineRoute(
          {
            method: 'GET',
            path: '/page',
            operationId: 'page',
            summary: 'p',
            tags: ['t'],
            query: z.object({ limit: z.coerce.number().int().max(100) }),
            response: z.object({ limit: z.number() }),
            errors: [400, 429],
          },
          async (_ctx, { query }) => {
            if (query.limit === 99) throw new RateLimitedError(17);
            if (query.limit === 98)
              throw new Error(
                'db host 10.0.0.1 unreachable for secret@example.com',
              );
            return query;
          },
        ),
        create: defineRoute(
          {
            method: 'POST',
            path: '/things/{id}',
            operationId: 'createThing',
            summary: 'c',
            tags: ['t'],
            params: z.object({ id: z.uuid() }),
            body: z.object({ name: z.string().min(2) }).strict(),
            response: z.object({ ok: z.boolean() }),
            successStatus: 201,
            errors: [400, 404, 409],
          },
          async (_ctx, { body }) => {
            if (body.name === 'conflict')
              throw new ConflictError('STALE_STATE');
            return { ok: true };
          },
        ),
      };
      const call = (
        path: string,
        init: RequestInit & { actor?: Actor; aal?: 'aal1' | 'aal2' } = {},
      ) => {
        const url = new URL(path, APP_URL);
        const [, name, id] = url.pathname.split('/');
        const route =
          name === 'things'
            ? routes.create
            : routes[name as 'me' | 'verticals' | 'page'];
        const headers = new Headers(init.headers);
        if (init.actor) headers.set('x-test-actor', init.actor);
        if (init.aal) headers.set('x-test-aal', init.aal);
        return route(new Request(url, { ...init, headers }), {
          params: Promise.resolve(id ? { id } : {}),
        });
      };
      await fn(call, log);
      expect(
        Object.keys(buildOpenApiDocument(registry).paths ?? {}).sort(),
      ).toEqual(['/me', '/page', '/things/{id}', '/verticals']);
    });
  }
  const unsafeHeaders = {
    origin: APP_URL,
    'content-type': 'application/json',
    'x-csrf-protection': '1',
  };
  const problem = async (response: Response) => {
    expect(response.headers.get('content-type')).toBe(
      'application/problem+json',
    );
    return response.json();
  };

  it('maps authentication failures to 401 codes', async () => {
    await withRoutes(async (call) => {
      expect(await problem(await call('/me'))).toMatchObject({
        status: 401,
        code: 'UNAUTHENTICATED',
      });
      expect(
        (await problem(await call('/me', { actor: 'expired' }))).code,
      ).toBe('SESSION_EXPIRED');
      expect(
        (await problem(await call('/me', { actor: 'inactive' }))).code,
      ).toBe('USER_DEACTIVATED');
      expect(
        (await problem(await call('/verticals', { actor: 'admin' }))).code,
      ).toBe('MFA_REQUIRED');
    });
  });

  it('returns /me without secrets and scoped verticals; Finance gets 404', async () => {
    await withRoutes(async (call) => {
      const me = await call('/me', { actor: 'multi' });
      expect(me.status).toBe(200);
      expect(me.headers.get('cache-control')).toBe('private, no-store');
      const body = meSchema.parse(await me.json());
      expect(body.user.id).toBe(actors.multi.id);
      expect(body.roles.map((role) => role.vertical?.id).sort()).toEqual(
        [verticalA, verticalB].sort(),
      );
      expect(JSON.stringify(body)).not.toMatch(
        /authUserId|sessionId|auth_user_id/,
      );
      expect(
        body.grants.some((grant) => grant.permission === 'audit.read'),
      ).toBe(false);
      const verticals = await call('/verticals', { actor: 'headA' });
      expect(
        (await verticals.json()).items.map((item: { id: string }) => item.id),
      ).toEqual([verticalA]);
      expect(
        await problem(
          await call('/verticals', { actor: 'finance', aal: 'aal2' }),
        ),
      ).toMatchObject({ status: 404, code: 'NOT_FOUND' });
      const adminMe = meSchema.parse(
        await (await call('/me', { actor: 'admin' })).json(),
      );
      expect(adminMe.mfaRequired).toBe(true);
    });
  });

  it('rejects unsafe requests without Origin, JSON and X-CSRF-Protection before authentication', async () => {
    await withRoutes(async (call) => {
      const id = randomUUID();
      for (const headers of [
        {} as Record<string, string>,
        { ...unsafeHeaders, origin: 'https://evil.test' },
        { ...unsafeHeaders, 'content-type': 'text/plain' },
        { origin: APP_URL, 'content-type': 'application/json' },
      ]) {
        const response = await call(`/things/${id}`, {
          method: 'POST',
          headers,
          body: '{}',
          actor: 'headA',
        });
        expect(await problem(response)).toMatchObject({
          status: 403,
          code: 'CSRF_FORBIDDEN',
        });
      }
      const created = await call(`/things/${id}`, {
        method: 'POST',
        headers: unsafeHeaders,
        body: JSON.stringify({ name: 'ok' }),
        actor: 'headA',
      });
      expect(created.status).toBe(201);
    });
  });

  it('maps validation, conflict, rate limit and unexpected errors', async () => {
    await withRoutes(async (call, log) => {
      const post = (path: string, body: string) =>
        call(path, {
          method: 'POST',
          headers: unsafeHeaders,
          body,
          actor: 'headA',
        });
      const id = randomUUID();
      const invalid = await problem(
        await post(`/things/${id}`, JSON.stringify({ name: 'x', extra: 1 })),
      );
      expect(invalid).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
      expect(
        invalid.errors.map((error: { path: string }) => error.path).sort(),
      ).toEqual(['body', 'body.name']);
      expect(
        (await problem(await post(`/things/${id}`, '{not json'))).errors,
      ).toEqual([{ path: 'body', code: 'invalid_json' }]);
      expect(
        (
          await problem(
            await post('/things/not-a-uuid', JSON.stringify({ name: 'ok' })),
          )
        ).errors[0].path,
      ).toBe('params.id');
      expect(
        await problem(
          await post(`/things/${id}`, JSON.stringify({ name: 'conflict' })),
        ),
      ).toMatchObject({ status: 409, code: 'STALE_STATE' });
      expect(
        (await problem(await call('/page?limit=500', { actor: 'headA' })))
          .errors[0].path,
      ).toBe('query.limit');
      const limited = await call('/page?limit=99', { actor: 'headA' });
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBe('17');
      const crashed = await call('/page?limit=98', { actor: 'headA' });
      const text = await crashed.text();
      expect(crashed.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({ code: 'INTERNAL' });
      expect(text).not.toMatch(/secret@example\.com|10\.0\.0\.1/);
      const last = log.at(-1)!;
      expect(last).toMatchObject({
        operationId: 'page',
        status: 500,
        userId: actors.headA.id,
      });
      expect(last.error).toBeInstanceOf(Error);
      expect(log.find((entry) => entry.status === 429)?.error).toBeUndefined();
    });
  });
});
