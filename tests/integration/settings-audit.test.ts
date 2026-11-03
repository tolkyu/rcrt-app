import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  auditEntrySchema,
  auditRecordSchema,
  auditPageSchema,
  auditQuerySchema,
  type AuditEntry,
  type AuditPage,
  type AuditQuery,
} from '../../lib/schemas/audit';
import { encodeTimeIdCursor } from '../../lib/schemas/cursor';
import { writeAudit } from '../../server/audit';
import type { VerifiedIdentity } from '../../server/context/identity';
import { loadAuthContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { createRouteFactory } from '../../server/http/define-route';
import { createApiRegistry } from '../../server/http/openapi';
import {
  getAuditActor,
  getAuditRecord,
  listAudit,
  listAuditActors,
} from '../../server/services/audit';
import { createVertical, renameVertical } from '../../server/services/vertical';
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

describe('Grouped action OR filter [STORY-AUD-2, VIS-01..03]', () => {
  it('uses one read query, ORs actions, ANDs actor/entity/result/Kyiv dates and preserves tied cursor ordering', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const entityId = randomUUID();
      args.at(new Date('2032-02-07T10:00:00Z'));
      for (const action of [
        'vertical.created',
        'vertical.renamed',
        'vertical.renamed',
      ])
        await writeAudit(ctx.db, ctx, {
          action,
          entityType: 'vertical',
          entityId,
          result: 'DENIED',
        });
      await writeAudit(ctx.db, ctx, {
        action: 'user.invited',
        entityType: 'vertical',
        entityId,
        result: 'DENIED',
      });
      await writeAudit(ctx.db, ctx, {
        action: 'vertical.created',
        entityType: 'vertical',
        entityId,
        result: 'SUCCESS',
      });
      await writeAudit(
        ctx.db,
        { ...ctx, auth: null },
        {
          action: 'vertical.created',
          entityType: 'vertical',
          entityId,
          result: 'DENIED',
        },
      );
      await writeAudit(ctx.db, ctx, {
        action: 'vertical.created',
        entityType: 'user',
        entityId,
        result: 'DENIED',
      });
      await writeAudit(ctx.db, ctx, {
        action: 'vertical.created',
        entityType: 'vertical',
        entityId: randomUUID(),
        result: 'DENIED',
      });
      args.at(new Date('2032-02-08T10:00:00Z'));
      await writeAudit(ctx.db, ctx, {
        action: 'vertical.created',
        entityType: 'vertical',
        entityId,
        result: 'DENIED',
      });
      const filters = {
        actions: 'vertical.renamed,vertical.created,vertical.renamed',
        entityType: 'vertical' as const,
        entityId,
        actorId: args.user.id,
        result: 'DENIED' as const,
        from: '2032-02-07',
        to: '2032-02-07',
        limit: 2,
      };
      const select = vi.spyOn(ctx.db, 'select');
      const insert = vi.spyOn(ctx.db, 'insert');
      try {
        const first = await listAudit(ctx, filters);
        expect(select).toHaveBeenCalledTimes(1);
        expect(insert).not.toHaveBeenCalled();
        expect(first.items).toHaveLength(2);
        const second = await listAudit(ctx, {
          ...filters,
          cursor: first.nextCursor!,
        });
        const items = [...first.items, ...second.items];
        expect(items.map((item) => item.action).sort()).toEqual([
          'vertical.created',
          'vertical.renamed',
          'vertical.renamed',
        ]);
        expect(new Set(items.map((item) => item.id)).size).toBe(3);
        expect(
          items.every(
            (item, index) =>
              index === 0 || BigInt(items[index - 1]!.id) > BigInt(item.id),
          ),
        ).toBe(true);
        expect(second.nextCursor).toBeNull();
        expect(select).toHaveBeenCalledTimes(2);
        expect(insert).not.toHaveBeenCalled();
      } finally {
        select.mockRestore();
        insert.mockRestore();
      }
    });
  });

  it.each([
    'RECRUITER',
    'HEAD_RECRUITER',
    'HEAD_HR',
    'HR',
    'TEAM_LEAD',
    'FINANCE',
  ] as const)(
    'denies multi-action results to %s with verified MFA',
    async (role) => {
      await fixture.run(async (args) => {
        if (role !== 'RECRUITER')
          await args.ctx.db.insert(schema.userRole).values({
            userId: args.user.id,
            role,
            verticalId: role === 'FINANCE' ? null : args.user.verticalId,
          });
        const ctx = await request(args, {
          admin: false,
          aal: 'aal2',
          verified: true,
        });
        await expect(
          listAudit(ctx, {
            view: 'security',
            actions: 'user.invited,auth.login_failed',
          }),
        ).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
      });
    },
  );

  it('denies an Admin without verified MFA and retains legacy unknown-action requests', async () => {
    for (const aal of ['aal1', 'aal2'] as const)
      await fixture.run(async (args) => {
        const ctx = await request(args, {
          admin: true,
          aal,
          verified: false,
        });
        await expect(
          listAudit(ctx, {
            view: 'security',
            actions: 'user.invited,auth.login_failed',
          }),
        ).rejects.toMatchObject({ status: 401, code: 'MFA_REQUIRED' });
      });
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      expect((await listAudit(ctx, { action: 'future.action' })).items).toEqual(
        [],
      );
      for (const input of [
        { actions: 'future.action' },
        { action: 'user.invited', actions: 'auth.login_failed' },
      ])
        await expect(listAudit(ctx, input)).rejects.toMatchObject({
          name: 'ZodError',
        });
    });
  });
});

describe('Security view intersects manual selection [STORY-AUD-2, Q-158]', () => {
  it('includes historic auth and literal user.mfa_ prefixes while ANDing other filters and selected actions', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const entityId = randomUUID();
      const security = [
        'auth.historic_event',
        'auth.login_failed',
        'user.mfa_historic',
        'user.mfa_reset',
      ];
      for (const action of [
        ...security,
        'user.mfax_reset',
        'user.mfa',
        'authentication.login_failed',
        'vertical.renamed',
      ])
        await writeAudit(ctx.db, ctx, {
          action,
          entityType: 'user',
          entityId,
          result: 'DENIED',
        });
      await writeAudit(ctx.db, ctx, {
        action: 'auth.login_failed',
        entityType: 'user',
        entityId,
        result: 'SUCCESS',
      });
      await writeAudit(ctx.db, ctx, {
        action: 'auth.login_failed',
        entityType: 'user',
        entityId: randomUUID(),
        result: 'DENIED',
      });
      await writeAudit(
        ctx.db,
        { ...ctx, auth: null },
        {
          action: 'auth.login_failed',
          entityType: 'user',
          entityId,
          result: 'DENIED',
        },
      );
      const filters = {
        view: 'security' as const,
        entityType: 'user' as const,
        entityId,
        actorId: args.user.id,
        result: 'DENIED' as const,
        from: '2026-11-16',
        to: '2026-11-16',
      };
      const select = vi.spyOn(ctx.db, 'select');
      const insert = vi.spyOn(ctx.db, 'insert');
      try {
        const page = await listAudit(ctx, filters);
        expect(page.items.map((item) => item.action).sort()).toEqual(
          [...security].sort(),
        );
        expect(select).toHaveBeenCalledTimes(1);
        expect(insert).not.toHaveBeenCalled();
        expect(
          (
            await listAudit(ctx, {
              ...filters,
              actions: 'vertical.renamed,auth.login_failed,user.mfa_reset',
            })
          ).items
            .map((item) => item.action)
            .sort(),
        ).toEqual(['auth.login_failed', 'user.mfa_reset']);
        expect(
          (await listAudit(ctx, { ...filters, action: 'vertical.renamed' }))
            .items,
        ).toEqual([]);
        expect(
          (
            await listAudit(ctx, { ...filters, action: 'auth.historic_event' })
          ).items.map((item) => item.action),
        ).toEqual(['auth.historic_event']);
        expect(
          (await listAudit(ctx, { ...filters, view: 'all' })).items,
        ).toHaveLength(8);
        expect(insert).not.toHaveBeenCalled();
      } finally {
        select.mockRestore();
        insert.mockRestore();
      }
    });
  });

  it('passes canonical multi-selection through the real route factory into the service and rejects malformed query transports', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      await writeAudit(ctx.db, ctx, {
        action: 'auth.login_failed',
        result: 'DENIED',
      });
      await writeAudit(ctx.db, ctx, {
        action: 'vertical.renamed',
        result: 'DENIED',
      });
      const service = vi.fn(listAudit);
      const get = auditRoute(args, () => ctx.identity, service);
      const select = vi.spyOn(ctx.db, 'select');
      const insert = vi.spyOn(ctx.db, 'insert');
      try {
        const response = await get(
          'view=security&actions=vertical.renamed,auth.login_failed,auth.login_failed&result=DENIED',
        );
        expect(response.status).toBe(200);
        expect(
          auditPageSchema
            .parse(await response.json())
            .items.map((item) => item.action),
        ).toEqual(['auth.login_failed']);
        expect(service).toHaveBeenCalledTimes(1);
        expect(select).toHaveBeenCalledTimes(1);
        expect(insert).not.toHaveBeenCalled();
        service.mockClear();
        for (const query of [
          'action=user.invited&actions=auth.login_failed',
          'actions=user.invited&actions=auth.login_failed',
          'action=user.invited&action=auth.login_failed',
          'view=security&view=security',
          'view=unknown',
          'actions=',
          'actions=future.action',
          `actions=${Array.from({ length: 22 }, () => 'user.invited').join(',')}`,
          `actions=${'a'.repeat(2000)}`,
        ]) {
          expect((await get(query)).status, query).toBe(400);
        }
        expect(service).not.toHaveBeenCalled();
        expect(select).toHaveBeenCalledTimes(1);
        expect(insert).not.toHaveBeenCalled();
        expect((await get('action=future.action')).status).toBe(200);
      } finally {
        select.mockRestore();
        insert.mockRestore();
      }
    });
  });
});

describe('«Журнал дій» viewer [STORY-AUD-2, AUD, D25]', () => {
  it('lists newest first with actor and current entity name, and filters by entity, action and result', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const created = await createVertical(ctx, { name: 'Нутра' });
      args.at(new Date('2026-11-16T08:05:00Z'));
      await renameVertical(ctx, created.id, {
        name: 'Нутра EU',
        expectedVersion: 1,
      });
      args.at(new Date('2026-11-16T08:06:00Z'));
      await writeAudit(ctx.db, ctx, {
        action: 'vertical.renamed',
        result: 'DENIED',
        entityType: 'vertical',
        entityId: created.id,
        details: { reason: 'STALE_STATE' },
      });

      const page = await listAudit(ctx, {
        entityType: 'vertical',
        entityId: created.id,
      });
      expect(page.items.map((item) => [item.action, item.result])).toEqual([
        ['vertical.renamed', 'DENIED'],
        ['vertical.renamed', 'SUCCESS'],
        ['vertical.created', 'SUCCESS'],
      ]);
      expect(page.items[0]).toMatchObject({
        actorKind: 'USER',
        actor: {
          id: args.user.id,
          fullName: 'Тестовий користувач',
          isActive: true,
        },
        entity: { type: 'vertical', id: created.id, label: 'Нутра EU' },
      });
      for (const item of page.items) auditEntrySchema.parse(item);
      expect(page.nextCursor).toBeNull();

      const created_ = await listAudit(ctx, {
        entityType: 'vertical',
        entityId: created.id,
        action: 'vertical.created',
      });
      expect(created_.items).toHaveLength(1);
      const denied = await listAudit(ctx, {
        entityType: 'vertical',
        entityId: created.id,
        result: 'DENIED',
      });
      expect(denied.items.map((item) => item.result)).toEqual(['DENIED']);
      const byActor = await listAudit(ctx, {
        actorId: args.user.id,
        entityType: 'vertical',
      });
      expect(byActor.items.length).toBeGreaterThanOrEqual(3);
      expect(
        byActor.items.every((item) => item.actor?.id === args.user.id),
      ).toBe(true);
    });
  });

  it('uses Kyiv midnight for period boundaries after the DST change (30.10.2026 = 29.10 22:00 … 30.10 21:59:59 UTC)', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const entityId = randomUUID();
      const instants = [
        '2026-10-29T21:59:59.999Z',
        '2026-10-29T22:00:00.000Z',
        '2026-10-30T21:59:59.999Z',
        '2026-10-30T22:00:00.000Z',
      ];
      for (const instant of instants) {
        args.at(new Date(instant));
        await writeAudit(ctx.db, ctx, {
          action: 'vertical.created',
          entityType: 'vertical',
          entityId,
        });
      }
      const page = await listAudit(ctx, {
        from: '2026-10-30',
        to: '2026-10-30',
        entityType: 'vertical',
        entityId,
      });
      expect(page.items.map((item) => item.occurredAt)).toEqual([
        '2026-10-30T21:59:59.999Z',
        '2026-10-29T22:00:00.000Z',
      ]);
      expect(page.items[0]?.entity?.label).toBeNull();
    });
  });

  it('pages with a stable keyset cursor and no overlap', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const entityId = randomUUID();
      for (let minute = 0; minute < 5; minute += 1) {
        args.at(new Date(Date.UTC(2026, 10, 16, 8, minute)));
        await writeAudit(ctx.db, ctx, {
          action: 'vertical.created',
          entityType: 'vertical',
          entityId,
        });
      }
      const filter = { entityType: 'vertical' as const, entityId, limit: 2 };
      const first = await listAudit(ctx, filter);
      const second = await listAudit(ctx, {
        ...filter,
        cursor: first.nextCursor!,
      });
      const third = await listAudit(ctx, {
        ...filter,
        cursor: second.nextCursor!,
      });
      const ids = [...first.items, ...second.items, ...third.items].map(
        (item) => item.id,
      );
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
      expect(third.nextCursor).toBeNull();
    });
  });

  it('opens one record with before/after, user agent and request id; unknown ids are 404', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const created = await createVertical(ctx, { name: 'Нутра' });
      await renameVertical(ctx, created.id, {
        name: 'Нутра EU',
        expectedVersion: 1,
      });
      const { items } = await listAudit(ctx, {
        entityType: 'vertical',
        entityId: created.id,
        action: 'vertical.renamed',
      });
      const record = await getAuditRecord(ctx, items[0]!.id);
      auditRecordSchema.parse(record);
      expect(record).toMatchObject({
        before: { name: 'Нутра' },
        after: { name: 'Нутра EU' },
        details: null,
        userAgent: 'Auth integration QA',
        requestId: ctx.requestId,
      });
      await expect(getAuditRecord(ctx, '999999999999')).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        getAuditRecord(ctx, '9999999999999999999'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  it('rejects a period longer than a year and an entity id without its type', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      await expect(
        listAudit(ctx, { from: '2025-10-30', to: '2026-10-31' }),
      ).rejects.toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
      expect(
        (await listAudit(ctx, { from: '2025-10-31', to: '2026-10-31' })).items,
      ).toBeDefined();
      await expect(
        listAudit(ctx, { entityId: randomUUID() }),
      ).rejects.toMatchObject({ name: 'ZodError' });
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
  ] as const)('denies %s', async (_who, access, status, code) => {
    await fixture.run(async (args) => {
      const ctx = await request(args, access);
      await expect(listAudit(ctx, {})).rejects.toMatchObject({ status, code });
      await expect(getAuditRecord(ctx, '1')).rejects.toMatchObject({
        status,
        code,
      });
      await expect(listAuditActors(ctx, {})).rejects.toMatchObject({
        status,
        code,
      });
      await expect(getAuditActor(ctx, args.user.id)).rejects.toMatchObject({
        status,
        code,
      });
    });
  });
});

/** Users whose emails share `marker`, so `q` isolates them from other rows in the test database. */
async function seedActors(args: FixtureArgs, marker: string) {
  const now = args.ctx.clock.now();
  const users = {
    bohdan: {
      id: randomUUID(),
      email: `bohdan.${marker}@fixture.test`,
      fullName: `Богдан ${marker}`,
      activatedAt: now,
    },
    agata: {
      id: randomUUID(),
      email: `agata.${marker}@fixture.test`,
      fullName: `Агата ${marker}`,
      isActive: false,
      activatedAt: now,
      deactivatedAt: now,
    },
    yevhen: {
      id: randomUUID(),
      email: `yevhen.${marker}@fixture.test`,
      fullName: `Євген ${marker}`,
    },
    hanna: {
      id: randomUUID(),
      email: `hanna.${marker}@fixture.test`,
      fullName: `Ганна ${marker}`,
      activatedAt: now,
    },
  };
  await args.ctx.db.insert(schema.appUser).values(Object.values(users));
  return users;
}

describe('«Хто» actor lookup [STORY-AUD-2, wireframe settings-admin §3.1]', () => {
  it.each(['HEAD_RECRUITER', 'HEAD_HR', 'HR', 'TEAM_LEAD', 'FINANCE'] as const)(
    'denies actor lookup to %s even with verified MFA [VIS-01..03]',
    async (role) => {
      await fixture.run(async (args) => {
        await args.ctx.db.insert(schema.userRole).values({
          userId: args.user.id,
          role,
          verticalId: role === 'FINANCE' ? null : args.user.verticalId,
        });
        const ctx = await request(args, {
          admin: false,
          aal: 'aal2',
          verified: true,
        });
        for (const lookup of [
          () => listAuditActors(ctx, {}),
          () => getAuditActor(ctx, args.user.id),
        ])
          await expect(lookup()).rejects.toMatchObject({
            status: 404,
            code: 'NOT_FOUND',
          });
      });
    },
  );

  it('lists users who ever activated by name or email, active first in Ukrainian order, with isActive', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const marker = randomUUID().slice(0, 8);
      const users = await seedActors(args, marker);
      const option = (
        user: { id: string; fullName: string },
        isActive = true,
      ) => ({
        id: user.id,
        fullName: user.fullName,
        isActive,
      });

      const page = await listAuditActors(ctx, { q: marker });
      expect(page.items).toEqual([
        option(users.bohdan),
        option(users.hanna),
        option(users.agata, false),
      ]);
      expect(page.nextCursor).toBeNull();
      expect(Object.keys(page.items[0]!).sort()).toEqual([
        'fullName',
        'id',
        'isActive',
      ]);

      const byEmail = await listAuditActors(ctx, { q: `hanna.${marker}` });
      expect(byEmail.items.map((item) => item.id)).toEqual([users.hanna.id]);
      const byName = await listAuditActors(ctx, { q: `  агата ${marker} ` });
      expect(byName.items.map((item) => item.id)).toEqual([users.agata.id]);
      const neverActivated = await listAuditActors(ctx, {
        q: `yevhen.${marker}`,
      });
      expect(neverActivated.items).toEqual([]);
      const wildcard = await listAuditActors(ctx, { q: `%_${marker}` });
      expect(wildcard.items).toEqual([]);
    });
  });

  it('pages by keyset without overlap and starts from the first users when there is no search', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const marker = randomUUID().slice(0, 8);
      await seedActors(args, marker);
      const first = await listAuditActors(ctx, { q: marker, limit: 2 });
      expect(first.items).toHaveLength(2);
      const second = await listAuditActors(ctx, {
        q: marker,
        limit: 2,
        cursor: first.nextCursor!,
      });
      expect(second.items).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.items, ...second.items].map((item) => item.id)).size,
      ).toBe(3);

      const unfiltered = await listAuditActors(ctx, {});
      expect(unfiltered.items.length).toBeGreaterThan(0);
      expect(unfiltered.items.length).toBeLessThanOrEqual(20);
    });
  });

  it('rejects a one-letter search, unknown params and a malformed cursor', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      for (const input of [
        { q: 'а' },
        { q: 'x'.repeat(101) },
        { cursor: 'Богдан' },
        { limit: 51 },
        { email: 'x' },
      ])
        await expect(
          listAuditActors(ctx, input as never),
        ).rejects.toMatchObject({ name: 'ZodError' });
    });
  });

  it('resolves a deep-linked actor label, including deactivated users; unknown or malformed ids are null', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const users = await seedActors(args, randomUUID().slice(0, 8));
      expect(await getAuditActor(ctx, users.agata.id)).toEqual({
        id: users.agata.id,
        fullName: users.agata.fullName,
        isActive: false,
      });
      expect(await getAuditActor(ctx, randomUUID())).toBeNull();
      expect(await getAuditActor(ctx, 'system')).toBeNull();
    });
  });

  it('filters by «Система»: system rows except unknown-user sign-in failures (T4-K02); other non-uuid actors are rejected', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const system = { ...ctx, auth: null };
      args.at(new Date('2031-03-07T10:00:00Z'));
      await writeAudit(ctx.db, ctx, {
        action: 'vertical.created',
        entityType: 'vertical',
        entityId: args.user.verticalId,
      });
      await writeAudit(ctx.db, system, {
        action: 'vertical.renamed',
        entityType: 'vertical',
        entityId: args.user.verticalId,
      });
      await writeAudit(ctx.db, system, {
        action: 'auth.login_failed',
        result: 'DENIED',
      });
      await writeAudit(ctx.db, system, {
        action: 'auth.login_failed',
        result: 'DENIED',
        entityType: 'user',
        entityId: args.user.id,
      });
      const unfiltered = await listAudit(ctx, {
        from: '2031-03-07',
        to: '2031-03-07',
      });
      expect(unfiltered.items).toHaveLength(4);
      expect(
        unfiltered.items.some(
          (item) => item.action === 'auth.login_failed' && !item.entity,
        ),
      ).toBe(true);
      const page = await listAudit(ctx, {
        actorId: 'system',
        from: '2031-03-07',
        to: '2031-03-07',
      });
      expect(
        page.items.map((item) => [item.action, item.entity?.id ?? null]),
      ).toEqual(
        expect.arrayContaining([
          ['vertical.renamed', args.user.verticalId],
          ['auth.login_failed', args.user.id],
        ]),
      );
      expect(page.items).toHaveLength(2);
      expect(
        page.items.every(
          (item) => item.actorKind === 'SYSTEM' && item.actor === null,
        ),
      ).toBe(true);
      const security = await listAudit(ctx, {
        actorId: 'system',
        view: 'security',
        actions: 'auth.login_failed,vertical.renamed',
        from: '2031-03-07',
        to: '2031-03-07',
      });
      expect(
        security.items.map((item) => [item.action, item.entity?.id]),
      ).toEqual([['auth.login_failed', args.user.id]]);
      await expect(listAudit(ctx, { actorId: 'SYSTEM' })).rejects.toMatchObject(
        { name: 'ZodError' },
      );
    });
  });
});

const rowCursor = (item: AuditEntry) =>
  encodeTimeIdCursor({
    occurredAt: new Date(item.occurredAt),
    id: BigInt(item.id),
  });
const ids = (page: AuditPage) => page.items.map((item) => item.id);

/** Walks `older` pages from the newest, then `newer` pages back up from the oldest page's `prevCursor`. */
async function walkWindow(
  ctx: Awaited<ReturnType<typeof adminRequest>>,
  filters: AuditQuery,
) {
  const older = [await listAudit(ctx, filters)];
  while (older.at(-1)!.nextCursor)
    older.push(
      await listAudit(ctx, { ...filters, cursor: older.at(-1)!.nextCursor! }),
    );
  const newer: AuditPage[] = [];
  let cursor = older.at(-1)!.prevCursor;
  while (cursor) {
    const page = await listAudit(ctx, {
      ...filters,
      cursor,
      direction: 'newer',
    });
    newer.push(page);
    cursor = page.prevCursor;
  }
  return { older, newer };
}

function auditRoute(
  args: FixtureArgs,
  identity: () => VerifiedIdentity | null,
  service: typeof listAudit = listAudit,
) {
  const defineRoute = createRouteFactory({
    db: () => args.ctx.db,
    clock: args.ctx.clock,
    appUrl: () => 'http://localhost:3100',
    registry: createApiRegistry(),
    verifyIdentity: async () => identity(),
  });
  const route = defineRoute(
    {
      method: 'GET',
      path: '/audit',
      operationId: 'listAudit',
      summary: 'List audit',
      tags: ['Audit'],
      query: auditQuerySchema,
      response: auditPageSchema,
      errors: [400, 404],
    },
    (requestContext, { query }) => service(requestContext, query),
  );
  return (query: string) =>
    route(
      new Request(`http://localhost:3100/api/v1/audit?${query}`, {
        headers: { 'x-activity': 'background' },
      }),
      { params: Promise.resolve({}) },
    );
}

describe('«Показати новіші» window [STORY-AUD-4, PERF-05]', () => {
  it('reads newer pages newest first across equal-timestamp boundaries, with both cursors at both ends and one select per page', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const entityId = randomUUID();
      const write = () =>
        writeAudit(ctx.db, ctx, {
          action: 'vertical.renamed',
          entityType: 'vertical',
          entityId,
        });
      for (const [minute, count] of [
        [0, 3],
        [1, 3],
        [2, 1],
      ] as const) {
        args.at(new Date(Date.UTC(2033, 0, 10, 8, minute)));
        for (let index = 0; index < count; index += 1) await write();
      }
      const filters = { entityType: 'vertical' as const, entityId, limit: 2 };
      const select = vi.spyOn(ctx.db, 'select');
      const insert = vi.spyOn(ctx.db, 'insert');
      try {
        const { older, newer } = await walkWindow(ctx, filters);
        expect(older.map((page) => page.items.length)).toEqual([2, 2, 2, 1]);
        const entries = older.flatMap((page) => page.items);
        expect(new Set(entries.map((item) => item.id)).size).toBe(7);
        expect(
          entries.every((item, index) => {
            const previous = entries[index - 1];
            return (
              !previous ||
              previous.occurredAt > item.occurredAt ||
              (previous.occurredAt === item.occurredAt &&
                BigInt(previous.id) > BigInt(item.id))
            );
          }),
        ).toBe(true);
        expect(older[0]!.prevCursor).toBeNull();
        expect(older.slice(1).map((page) => page.prevCursor)).toEqual(
          older.slice(1).map((page) => rowCursor(page.items[0]!)),
        );
        const above = older.slice(0, 3).reverse();
        expect(newer.map(ids)).toEqual(above.map(ids));
        expect(newer.map((page) => page.nextCursor)).toEqual(
          above.map((page) => page.nextCursor),
        );
        expect(newer.map((page) => page.prevCursor)).toEqual([
          rowCursor(older[2]!.items[0]!),
          rowCursor(older[1]!.items[0]!),
          null,
        ]);
        expect(select).toHaveBeenCalledTimes(older.length + newer.length);
        expect(insert).not.toHaveBeenCalled();
        select.mockClear();

        args.at(new Date(Date.UTC(2033, 0, 10, 8, 3)));
        await write();
        const top = await listAudit(ctx, {
          ...filters,
          cursor: older[1]!.prevCursor!,
          direction: 'newer',
        });
        expect(ids(top)).toEqual(ids(older[0]!));
        expect(top.prevCursor).toBe(rowCursor(top.items[0]!));
        const latest = await listAudit(ctx, {
          ...filters,
          cursor: top.prevCursor!,
          direction: 'newer',
        });
        expect(latest.items).toHaveLength(1);
        expect(entries.map((item) => item.id)).not.toContain(
          latest.items[0]!.id,
        );
        expect(latest.prevCursor).toBeNull();
        expect(latest.nextCursor).toBe(rowCursor(latest.items[0]!));
        expect(select).toHaveBeenCalledTimes(2);
      } finally {
        select.mockRestore();
        insert.mockRestore();
      }
    });
  });

  it('ANDs period, actor, entity, result, selected actions and the security view in the newer direction', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const entityId = randomUUID();
      const matching = {
        action: 'auth.login_failed',
        entityType: 'user',
        entityId,
        result: 'DENIED',
      } as const;
      const noise = [
        { ...matching, action: 'user.invited' },
        { ...matching, action: 'user.mfa_reset' },
        { ...matching, action: 'vertical.renamed' },
        { ...matching, result: 'SUCCESS' },
        { ...matching, entityId: randomUUID() },
      ] as const;
      for (let minute = 0; minute < 5; minute += 1) {
        args.at(new Date(Date.UTC(2033, 1, 14, 8, minute)));
        await writeAudit(ctx.db, ctx, matching);
        await writeAudit(ctx.db, { ...ctx, auth: null }, matching);
        for (const row of noise) await writeAudit(ctx.db, ctx, row);
      }
      args.at(new Date(Date.UTC(2033, 1, 14, 23, 0)));
      await writeAudit(ctx.db, ctx, matching);
      const filters = {
        view: 'security' as const,
        actions: 'vertical.renamed,user.invited,auth.login_failed',
        actorId: args.user.id,
        entityType: 'user' as const,
        entityId,
        result: 'DENIED' as const,
        from: '2033-02-14',
        to: '2033-02-14',
        limit: 2,
      };
      const { older, newer } = await walkWindow(ctx, filters);
      expect(older.map((page) => page.items.length)).toEqual([2, 2, 1]);
      expect(
        [...older, ...newer]
          .flatMap((page) => page.items)
          .every(
            (item) =>
              item.action === 'auth.login_failed' &&
              item.result === 'DENIED' &&
              item.actor?.id === args.user.id &&
              item.entity?.id === entityId,
          ),
      ).toBe(true);
      expect(newer.map(ids)).toEqual(older.slice(0, 2).reverse().map(ids));
      expect(newer.at(-1)!.prevCursor).toBeNull();
    });
  });

  it('validates direction over HTTP and keeps cursor-only requests unchanged', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const entityId = randomUUID();
      for (let minute = 0; minute < 3; minute += 1) {
        args.at(new Date(Date.UTC(2033, 2, 1, 8, minute)));
        await writeAudit(ctx.db, ctx, {
          action: 'vertical.created',
          entityType: 'vertical',
          entityId,
        });
      }
      // The route reloads the session per request; return the clock from the seeded future dates.
      args.at(new Date('2026-11-16T08:00:00Z'));
      let identity: VerifiedIdentity | null = ctx.identity;
      const get = auditRoute(args, () => identity);
      const json = async (query: string) => {
        const response = await get(query);
        expect(response.status, query).toBe(200);
        return auditPageSchema.parse(await response.json());
      };
      const base = `entityType=vertical&entityId=${entityId}&limit=1`;
      const first = await json(base);
      expect(first.prevCursor).toBeNull();
      const cursor = encodeURIComponent(first.nextCursor!);
      const legacy = await json(`${base}&cursor=${cursor}`);
      expect(await json(`${base}&cursor=${cursor}&direction=older`)).toEqual(
        legacy,
      );
      expect(legacy.items).toHaveLength(1);
      expect(legacy.items[0]!.id).not.toBe(first.items[0]!.id);
      expect(legacy.nextCursor).toBe(rowCursor(legacy.items[0]!));
      expect(legacy.prevCursor).toBe(rowCursor(legacy.items[0]!));
      const back = await json(
        `${base}&cursor=${encodeURIComponent(legacy.prevCursor!)}&direction=newer`,
      );
      expect(back.items).toEqual(first.items);
      expect(back.prevCursor).toBeNull();
      expect(back.nextCursor).toBe(first.nextCursor);
      for (const query of [
        `${base}&direction=newer`,
        `${base}&direction=sideways`,
        `${base}&direction=`,
        `${base}&cursor=${cursor}&direction=NEWER`,
        `${base}&cursor=${cursor}&direction=newer&direction=older`,
        `${base}&cursor=garbage&direction=newer`,
      ])
        expect((await get(query)).status, query).toBe(400);
      identity = null;
      expect(
        (await get(`${base}&cursor=${cursor}&direction=newer`)).status,
      ).toBe(401);
    });
  });

  it.each([
    ['a Head Recruiter', 'HEAD_RECRUITER', false, 'aal2', 404],
    ['Finance', 'FINANCE', false, 'aal2', 404],
    ['an aal1 Admin', null, true, 'aal1', 401],
  ] as const)(
    'denies %s a newer page without widening scope',
    async (_who, role, admin, aal, status) => {
      await fixture.run(async (args) => {
        if (role)
          await args.ctx.db.insert(schema.userRole).values({
            userId: args.user.id,
            role,
            verticalId: role === 'FINANCE' ? null : args.user.verticalId,
          });
        const ctx = await request(args, {
          admin,
          aal,
          verified: aal === 'aal2',
        });
        const cursor = encodeTimeIdCursor({
          occurredAt: new Date('2020-01-01T00:00:00.000Z'),
          id: 1n,
        });
        const response = await auditRoute(
          args,
          () => ctx.identity,
        )(`cursor=${encodeURIComponent(cursor)}&direction=newer`);
        expect(response.status).toBe(status);
        await expect(
          listAudit(ctx, { cursor, direction: 'newer' }),
        ).rejects.toMatchObject({ status });
      });
    },
  );
});
