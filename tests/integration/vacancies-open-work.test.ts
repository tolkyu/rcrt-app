import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { positionNameKey } from '../../lib/position-name';
import { loadAuthContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import {
  deactivateUser,
  reactivateUser,
} from '../../server/services/user-activation';
import { updateUserRoles } from '../../server/services/user-roles';
import { createAuthFixture } from '../support/auth-fixture';
import { startJwksFixture } from '../unit/auth/jwks-fixture';

let jwks: Awaited<ReturnType<typeof startJwksFixture>>;
let fixture: ReturnType<typeof createAuthFixture>;
beforeAll(async () => {
  jwks = await startJwksFixture();
  fixture = createAuthFixture(jwks, 'migration');
});
afterAll(async () => {
  await Promise.all([fixture.close(), jwks.stop()]);
});

type Fixture = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];
type Role = { role: string; verticalId: string | null };

async function adminCaller(args: Fixture) {
  await args.ctx.db.insert(schema.userRole).values({
    userId: args.user.id,
    role: 'ADMIN',
    verticalId: null,
  });
  await args.markMfaVerified();
  const identity = { ...args.identity, aal: 'aal2' as const };
  return {
    ...args.ctx,
    identity,
    auth: await loadAuthContext(args.ctx.db, identity, args.ctx.clock),
  };
}

async function member(args: Fixture, roles: Role[]) {
  const userId = randomUUID();
  const authUserId = randomUUID();
  const session = await args.provider.issueSession(authUserId);
  await args.ctx.db.insert(schema.appUser).values({
    id: userId,
    email: `${userId}@fixture.test`,
    fullName: 'Василь Мороз',
    authUserId,
    activatedAt: args.ctx.clock.now(),
  });
  await args.ctx.db
    .insert(schema.userRole)
    .values(roles.map((r) => ({ userId, ...r })));
  await args.ctx.db.insert(schema.userSession).values({
    userId,
    sessionId: session.sessionId,
    method: 'MAGIC_LINK',
    startedAt: args.ctx.clock.now(),
    lastSeenAt: args.ctx.clock.now(),
  });
  return { userId, authUserId, roles };
}

async function position(args: Fixture) {
  const name = `Позиція ${randomUUID()}`;
  const [row] = await args.ctx.db
    .insert(schema.position)
    .values({
      verticalId: args.user.verticalId,
      name,
      nameKey: positionNameKey(name),
      createdBy: args.user.id,
    })
    .returning({ id: schema.position.id });
  return row!.id;
}

async function vacancy(
  args: Fixture,
  positionId: string,
  values: {
    teamLeadId?: string;
    status?: 'DRAFT' | 'OPEN' | 'ON_HOLD' | 'CANCELLED';
    recruiters?: string[];
    deleted?: boolean;
  },
) {
  const status = values.status ?? 'OPEN';
  const now = args.ctx.clock.now();
  const [row] = await args.ctx.db
    .insert(schema.vacancy)
    .values({
      verticalId: args.user.verticalId,
      positionId: status === 'DRAFT' ? null : positionId,
      title: 'Медіабаєр — Facebook',
      teamLeadId: values.teamLeadId ?? null,
      recruiterInitiated: !values.teamLeadId,
      status,
      openedAt: status === 'DRAFT' ? null : now,
      closedAt: status === 'CANCELLED' ? now : null,
      createdBy: args.user.id,
      deletedAt: values.deleted ? now : null,
      deletedBy: values.deleted ? args.user.id : null,
      deleteReason: values.deleted ? 'Дублікат' : null,
    })
    .returning({ id: schema.vacancy.id });
  if (values.recruiters?.length)
    await args.ctx.db.insert(schema.vacancyRecruiter).values(
      values.recruiters.map((userId) => ({
        vacancyId: row!.id,
        userId,
        assignedBy: args.user.id,
      })),
    );
  return row!.id;
}

/** Everything a refused operation must leave untouched. */
async function stored(args: Fixture, userId: string) {
  const [user, roles, sessions, events, audits] = await Promise.all([
    args.ctx.db
      .select()
      .from(schema.appUser)
      .where(eq(schema.appUser.id, userId)),
    args.ctx.db
      .select()
      .from(schema.userRole)
      .where(eq(schema.userRole.userId, userId)),
    args.ctx.db
      .select()
      .from(schema.userSession)
      .where(eq(schema.userSession.userId, userId)),
    args.ctx.db
      .select()
      .from(schema.entityEvent)
      .where(eq(schema.entityEvent.subjectId, userId)),
    args.ctx.db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, userId)),
  ]);
  return { user, roles, sessions, events, audits };
}

function deps(args: Fixture) {
  const admin = args.provider.admin();
  const setBanned = vi.spyOn(admin, 'setBanned');
  return {
    deps: { ...args.provider.dependencies(), admin: () => admin },
    setBanned,
  };
}

describe('Deactivation keeps open vacancy work [ROLE-06, D24, D43, STORY-ROLE-06-1]', () => {
  it.each([
    ['a Team Lead leading an OPEN vacancy', 'TEAM_LEAD', 'OPEN', 'lead'],
    ['a Team Lead leading a DRAFT', 'TEAM_LEAD', 'DRAFT', 'lead'],
    ['a Team Lead leading an ON_HOLD vacancy', 'TEAM_LEAD', 'ON_HOLD', 'lead'],
    [
      'a recruiter assigned to an OPEN vacancy',
      'RECRUITER',
      'OPEN',
      'assigned',
    ],
    [
      'a head recruiter assigned to an ON_HOLD vacancy',
      'HEAD_RECRUITER',
      'ON_HOLD',
      'assigned',
    ],
  ] as const)(
    'refuses %s with USER_HAS_OPEN_WORK before any provider or app write',
    async (_name, role, status, link) => {
      await fixture.run(async (args) => {
        const ctx = await adminCaller(args);
        const target = await member(args, [
          { role, verticalId: args.user.verticalId },
        ]);
        await vacancy(args, await position(args), {
          status,
          ...(link === 'lead'
            ? { teamLeadId: target.userId }
            : { teamLeadId: args.user.id, recruiters: [target.userId] }),
        });
        const before = await stored(args, target.userId);
        const { deps: provider, setBanned } = deps(args);

        await expect(
          deactivateUser(provider, ctx, target.userId, { expectedVersion: 1 }),
        ).rejects.toMatchObject({ code: 'USER_HAS_OPEN_WORK', status: 409 });

        expect(setBanned).not.toHaveBeenCalled();
        expect(args.provider.banned.size).toBe(0);
        expect(await stored(args, target.userId)).toEqual(before);
        expect(before.events).toEqual([]);
        expect(before.audits).toEqual([]);
      });
    },
  );

  it('deactivates once the work is closed, soft-deleted or never existed', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminCaller(args);
      const positionId = await position(args);
      const lead = await member(args, [
        { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
      ]);
      const recruiter = await member(args, [
        { role: 'RECRUITER', verticalId: args.user.verticalId },
      ]);
      await vacancy(args, positionId, {
        status: 'CANCELLED',
        teamLeadId: lead.userId,
        recruiters: [recruiter.userId],
      });
      await vacancy(args, positionId, {
        teamLeadId: lead.userId,
        recruiters: [recruiter.userId],
        deleted: true,
      });
      for (const target of [lead, recruiter]) {
        const { deps: provider, setBanned } = deps(args);
        expect(
          await deactivateUser(provider, ctx, target.userId, {
            expectedVersion: 1,
          }),
        ).toEqual({
          version: 2,
          status: 'DEACTIVATED',
        });
        expect(setBanned).toHaveBeenCalledWith(target.authUserId, true);
      }
    });
  });

  it('serves the vacancy history unchanged after a refusal', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminCaller(args);
      const target = await member(args, [
        { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
      ]);
      const id = await vacancy(args, await position(args), {
        teamLeadId: target.userId,
      });
      const [before] = await args.ctx.db
        .select()
        .from(schema.vacancy)
        .where(eq(schema.vacancy.id, id));
      await expect(
        deactivateUser(deps(args).deps, ctx, target.userId, {
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ code: 'USER_HAS_OPEN_WORK' });
      const [after] = await args.ctx.db
        .select()
        .from(schema.vacancy)
        .where(eq(schema.vacancy.id, id));
      expect(after).toEqual(before);
    });
  });
});

describe('Role removal keeps open vacancy work [ROLE-06, D24, D43, STORY-ROLE-06-1]', () => {
  it('refuses removing the Team Lead role of a led OPEN vacancy and leaves roles, version and history untouched', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminCaller(args);
      const roles = [
        { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
        { role: 'RECRUITER', verticalId: args.user.verticalId },
      ];
      const target = await member(args, roles);
      await vacancy(args, await position(args), { teamLeadId: target.userId });
      const before = await stored(args, target.userId);

      await expect(
        updateUserRoles(ctx, target.userId, {
          expectedVersion: 1,
          roles: [{ role: 'RECRUITER', verticalId: args.user.verticalId }],
        }),
      ).rejects.toMatchObject({ code: 'USER_HAS_OPEN_WORK', status: 409 });
      expect(await stored(args, target.userId)).toEqual(before);
      expect(before.events).toEqual([]);
      expect(before.audits).toEqual([]);
    });
  });

  it('refuses dropping every recruiting role of an assigned recruiter but allows keeping a compatible one', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminCaller(args);
      const vertical = args.user.verticalId;
      const target = await member(args, [
        { role: 'RECRUITER', verticalId: vertical },
        { role: 'HEAD_RECRUITER', verticalId: vertical },
      ]);
      await vacancy(args, await position(args), {
        teamLeadId: args.user.id,
        recruiters: [target.userId],
      });

      await expect(
        updateUserRoles(ctx, target.userId, {
          expectedVersion: 1,
          roles: [{ role: 'HR', verticalId: vertical }],
        }),
      ).rejects.toMatchObject({ code: 'USER_HAS_OPEN_WORK' });
      expect((await stored(args, target.userId)).user[0]!.version).toBe(1);

      const result = await updateUserRoles(ctx, target.userId, {
        expectedVersion: 1,
        roles: [{ role: 'HEAD_RECRUITER', verticalId: vertical }],
      });
      expect(result.removed).toEqual([
        { role: 'RECRUITER', verticalId: vertical },
      ]);
    });
  });

  it('does not block removing roles of another vertical or adding roles', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminCaller(args);
      const [other] = await args.ctx.db
        .insert(schema.vertical)
        .values({ name: `Інша ${randomUUID()}` })
        .returning({ id: schema.vertical.id });
      const target = await member(args, [
        { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
        { role: 'RECRUITER', verticalId: other!.id },
      ]);
      await vacancy(args, await position(args), { teamLeadId: target.userId });

      const added = await updateUserRoles(ctx, target.userId, {
        expectedVersion: 1,
        roles: [
          { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
          { role: 'RECRUITER', verticalId: other!.id },
          { role: 'HR', verticalId: args.user.verticalId },
        ],
      });
      expect(added.added).toHaveLength(1);
      const removed = await updateUserRoles(ctx, target.userId, {
        expectedVersion: added.version,
        roles: [{ role: 'TEAM_LEAD', verticalId: args.user.verticalId }],
      });
      expect(removed.removed).toHaveLength(2);
    });
  });

  it('allows removing the role once the work is closed', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminCaller(args);
      const target = await member(args, [
        { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
      ]);
      await vacancy(args, await position(args), {
        status: 'CANCELLED',
        teamLeadId: target.userId,
      });
      const result = await updateUserRoles(ctx, target.userId, {
        expectedVersion: 1,
        roles: [],
      });
      expect(result.removed).toHaveLength(1);
    });
  });

  it('rejects reactivation that would drop roles still needed by open work', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminCaller(args);
      const target = await member(args, [
        { role: 'TEAM_LEAD', verticalId: args.user.verticalId },
      ]);
      await args.ctx.db
        .update(schema.appUser)
        .set({
          isActive: false,
          deactivatedAt: args.ctx.clock.now(),
          deactivatedBy: args.user.id,
        })
        .where(eq(schema.appUser.id, target.userId));
      await vacancy(args, await position(args), { teamLeadId: target.userId });
      const { deps: provider, setBanned } = deps(args);
      await expect(
        reactivateUser(provider, ctx, target.userId, {
          expectedVersion: 1,
          roles: [],
        }),
      ).rejects.toMatchObject({ code: 'USER_HAS_OPEN_WORK' });
      expect(setBanned).not.toHaveBeenCalled();
    });
  });
});
