import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEntrySchema, auditRecordSchema } from '../../lib/schemas/audit';
import { writeAudit } from '../../server/audit';
import { loadAuthContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { getAuditRecord, listAudit } from '../../server/services/audit';
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
    });
  });
});
