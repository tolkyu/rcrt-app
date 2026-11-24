import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  userDetailSchema,
  userEventPageSchema,
  userPageSchema,
  type UserListQuery,
} from '../../lib/schemas/user';
import { loadAuthContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { appendEvent } from '../../server/events';
import {
  getUserDetail,
  listUserEventPage,
  listUserPage,
} from '../../server/services/user';
import { createAuthFixture } from '../support/auth-fixture';
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';
import { listAuditActors } from '../../server/services/audit';
import { SEARCH_RATE_LIMIT } from '../../server/security/rate-limit';

let jwks: Awaited<ReturnType<typeof startJwksFixture>>;
let fixture: ReturnType<typeof createAuthFixture>;
let admin: ReturnType<typeof connectTestDatabase>;
beforeAll(async () => {
  jwks = await startJwksFixture();
  fixture = createAuthFixture(jwks);
  admin = connectTestDatabase(testDatabaseUrls().migration);
});
afterAll(async () => {
  await Promise.all([jwks.stop(), fixture.close(), admin.end()]);
});

type FixtureArgs = Parameters<
  Parameters<ReturnType<typeof createAuthFixture>['run']>[0]
>[0];

async function request(
  args: FixtureArgs,
  {
    role,
    aal,
    verified,
  }: {
    role: 'ADMIN' | 'HEAD_RECRUITER' | 'FINANCE';
    aal: 'aal1' | 'aal2';
    verified: boolean;
  },
) {
  await args.ctx.db.insert(schema.userRole).values({
    userId: args.user.id,
    role,
    verticalId:
      role === 'ADMIN' || role === 'FINANCE' ? null : args.user.verticalId,
  });
  if (verified) await args.markMfaVerified();
  const identity = { ...args.identity, aal };
  const auth = await loadAuthContext(args.ctx.db, identity, args.ctx.clock);
  return { ...args.ctx, auth, identity };
}

const HOUR = 3_600_000;

describe('User and actor search rate limiting [DG-09, SEC-AAF-03]', () => {
  it('shares 120 searches per user per minute without storing query text and resets at the next window', async () => {
    await fixture.run(async (args) => {
      const ctx = await request(args, {
        role: 'ADMIN',
        aal: 'aal2',
        verified: true,
      });
      const q = 'sensitive-name@fixture.test';
      await listUserPage(ctx, { q });
      for (let count = 1; count < SEARCH_RATE_LIMIT.perUser; count += 1)
        await listAuditActors(ctx, { q });
      await expect(listUserPage(ctx, { q })).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        status: 429,
      });
      await expect(listAuditActors(ctx, { q })).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        status: 429,
      });
      await expect(listUserPage(ctx, {})).resolves.toHaveProperty('items');
      await expect(listAuditActors(ctx, {})).resolves.toHaveProperty('items');
      await expect(listUserPage(ctx, { q: 'x' })).rejects.toHaveProperty(
        'name',
        'ZodError',
      );
      const buckets = await ctx.db.select().from(schema.rateLimitBucket);
      const stored = JSON.stringify(buckets);
      expect(stored).not.toContain(q);
      expect(stored).not.toContain(ctx.auth.userId);
      args.at(new Date(ctx.clock.now().getTime() + 60_000));
      await expect(listUserPage(ctx, { q })).resolves.toHaveProperty('items');
    });
  });

  it('denies an out-of-scope user before consuming search capacity', async () => {
    await fixture.run(async (args) => {
      const ctx = await request(args, {
        role: 'FINANCE',
        aal: 'aal2',
        verified: true,
      });
      const before = await ctx.db.select().from(schema.rateLimitBucket);
      await expect(listUserPage(ctx, { q: 'privacy' })).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        listAuditActors(ctx, { q: 'privacy' }),
      ).rejects.toMatchObject({ status: 404 });
      expect(await ctx.db.select().from(schema.rateLimitBucket)).toEqual(
        before,
      );
    });
  });
});

/** Users whose emails share `marker`, so `q` isolates them from other rows in the test database. */
async function seedUsers(args: FixtureArgs, marker: string) {
  const db = args.ctx.db;
  const now = args.ctx.clock.now();
  const crypto = randomUUID();
  await db
    .insert(schema.vertical)
    .values({ id: crypto, name: `Крипто ${marker}` });
  const make = <T extends object>(
    key: string,
    fullName: string,
    extra: T = {} as T,
  ) => ({
    id: randomUUID(),
    email: `${key}.${marker}@fixture.test`,
    fullName,
    ...extra,
  });
  const users = {
    active: make('active', 'Ґанна Активна', {
      authUserId: randomUUID(),
      activatedAt: now,
      lastLoginAt: new Date(now.getTime() - HOUR),
    }),
    admin: make('admin', 'Галина Адмін', {
      authUserId: randomUUID(),
      activatedAt: now,
    }),
    locked: make('locked', 'Єва Заблокована', {
      authUserId: randomUUID(),
      activatedAt: now,
      mfaLockedUntil: new Date(now.getTime() + HOUR),
    }),
    invited: make('invited', 'Іван Запрошений'),
    expired: make('expired', 'Їжак Прострочений'),
    revoked: make('revoked', 'Йосип Відкликаний'),
    deactivated: make('deactivated', 'Агата Деактивована', {
      activatedAt: now,
      isActive: false,
      deactivatedAt: now,
    }),
  };
  await db.insert(schema.appUser).values(Object.values(users));
  await db.insert(schema.userRole).values([
    {
      userId: users.active.id,
      role: 'RECRUITER',
      verticalId: args.user.verticalId,
    },
    { userId: users.active.id, role: 'TEAM_LEAD', verticalId: crypto },
    { userId: users.admin.id, role: 'ADMIN', verticalId: null },
    { userId: users.locked.id, role: 'FINANCE', verticalId: null },
    { userId: users.invited.id, role: 'RECRUITER', verticalId: crypto },
    {
      userId: users.deactivated.id,
      role: 'RECRUITER',
      verticalId: args.user.verticalId,
    },
  ]);
  const invite = (userId: string, sentAt: Date, revoked = false) => ({
    userId,
    tokenHash: createHash('sha256').update(randomUUID()).digest(),
    roles: [{ role: 'RECRUITER', verticalId: crypto }],
    sentAt,
    expiresAt: new Date(sentAt.getTime() + 72 * HOUR),
    invitedBy: args.user.id,
    ...(revoked
      ? { status: 'REVOKED' as const, revokedAt: now, revokedBy: args.user.id }
      : {}),
  });
  await db
    .insert(schema.userInvite)
    .values([
      invite(users.invited.id, new Date(now.getTime() - HOUR)),
      invite(users.expired.id, new Date(now.getTime() - 100 * HOUR)),
      invite(users.revoked.id, new Date(now.getTime() - HOUR), true),
    ]);
  return { users, crypto };
}

const adminRequest = (args: FixtureArgs) =>
  request(args, { role: 'ADMIN', aal: 'aal2', verified: true });

describe('Settings → Користувачі та ролі: list [ROLE-05-4, STORY-ROLE-05-4]', () => {
  it('derives every status and lists active users first in Ukrainian alphabetical order', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const marker = randomUUID().slice(0, 8);
      const { users, crypto } = await seedUsers(args, marker);
      const page = await listUserPage(ctx, { q: marker });
      userPageSchema.parse(page);
      expect(page.total).toBe(7);
      expect(page.nextCursor).toBeNull();
      expect(page.items.map((item) => [item.fullName, item.status])).toEqual([
        ['Галина Адмін', 'ACTIVE'],
        ['Ґанна Активна', 'ACTIVE'],
        ['Єва Заблокована', 'ACTIVE'],
        ['Іван Запрошений', 'INVITED'],
        ['Їжак Прострочений', 'INVITE_EXPIRED'],
        ['Йосип Відкликаний', 'REVOKED'],
        ['Агата Деактивована', 'DEACTIVATED'],
      ]);
      const byId = new Map(page.items.map((item) => [item.id, item]));
      expect(byId.get(users.active.id)).toMatchObject({
        email: users.active.email,
        lastLoginAt: new Date(ctx.clock.now().getTime() - HOUR).toISOString(),
        inviteExpiresAt: null,
        roles: [
          {
            role: 'RECRUITER',
            vertical: {
              id: args.user.verticalId,
              name: `Вертикаль ${args.user.verticalId}`,
            },
          },
          {
            role: 'TEAM_LEAD',
            vertical: { id: crypto, name: `Крипто ${marker}` },
          },
        ],
      });
      expect(byId.get(users.invited.id)?.inviteExpiresAt).toBe(
        new Date(ctx.clock.now().getTime() + 71 * HOUR).toISOString(),
      );
      expect(byId.get(users.expired.id)?.inviteExpiresAt).not.toBeNull();
      expect(byId.get(users.revoked.id)?.inviteExpiresAt).toBeNull();
    });
  });

  it('shows 2FA from verified TOTP factors, flags ADMIN/FINANCE without one, and shows the lockout', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const marker = randomUUID().slice(0, 8);
      const { users } = await seedUsers(args, marker);
      const factors = [
        [users.active.authUserId, 'totp', 'verified'],
        [users.active.authUserId, 'totp', 'verified'],
        [users.active.authUserId, 'totp', 'unverified'],
        [users.admin.authUserId, 'phone', 'verified'],
      ] as const;
      try {
        for (const [userId, type, status] of factors)
          await admin`insert into auth.mfa_factors (id, user_id, factor_type, status)
            values (${randomUUID()}, ${userId}, ${type}, ${status})`;
        const { items } = await listUserPage(ctx, { q: marker });
        const mfa = new Map(items.map((item) => [item.id, item.mfa]));
        expect(mfa.get(users.active.id)).toEqual({
          state: 'ENABLED',
          factors: 2,
          lockedUntil: null,
        });
        expect(mfa.get(users.admin.id)).toEqual({
          state: 'REQUIRED_MISSING',
          factors: 0,
          lockedUntil: null,
        });
        expect(mfa.get(users.locked.id)).toEqual({
          state: 'LOCKED',
          factors: 0,
          lockedUntil: users.locked.mfaLockedUntil.toISOString(),
        });
        expect(mfa.get(users.invited.id)?.state).toBe('NONE');
        expect(mfa.get(users.deactivated.id)?.state).toBe('NONE');
      } finally {
        await admin`delete from auth.mfa_factors where user_id in ${admin([
          users.active.authUserId,
          users.admin.authUserId,
        ])}`;
      }
    });
  });

  it.each<
    [
      string,
      (ids: { vertical: string; crypto: string }) => UserListQuery,
      string[],
    ]
  >([
    ['one status', () => ({ status: 'INVITED' }), ['Іван Запрошений']],
    [
      'several statuses',
      () => ({ status: ['INVITE_EXPIRED', 'DEACTIVATED'] }),
      ['Їжак Прострочений', 'Агата Деактивована'],
    ],
    ['a global role', () => ({ role: 'FINANCE' }), ['Єва Заблокована']],
    [
      'global roles via the vertical filter',
      () => ({ vertical: 'GLOBAL' }),
      ['Галина Адмін', 'Єва Заблокована'],
    ],
    [
      'a role in a vertical, on the same assignment',
      ({ crypto }) => ({ role: 'RECRUITER', vertical: crypto }),
      ['Іван Запрошений'],
    ],
    [
      'any role in a vertical',
      ({ vertical }) => ({ vertical }),
      ['Ґанна Активна', 'Агата Деактивована'],
    ],
    [
      'a name fragment, case-insensitively',
      () => ({ q: 'ЇЖАК' }),
      ['Їжак Прострочений'],
    ],
  ])('filters by %s', async (_name, build, expected) => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const marker = randomUUID().slice(0, 8);
      const { crypto } = await seedUsers(args, marker);
      const page = await listUserPage(ctx, {
        q: marker,
        ...build({ vertical: args.user.verticalId, crypto }),
      });
      expect(page.items.map((item) => item.fullName)).toEqual(expected);
      expect(page.total).toBe(expected.length);
    });
  });

  it('treats % and _ in the search as literal characters', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const marker = randomUUID().slice(0, 8);
      await seedUsers(args, marker);
      expect((await listUserPage(ctx, { q: '%%' })).total).toBe(0);
      expect(
        (await listUserPage(ctx, { q: `${marker.slice(0, 3)}_` })).total,
      ).toBe(0);
    });
  });

  it('pages by cursor in list order without gaps or repeats', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const marker = randomUUID().slice(0, 8);
      await seedUsers(args, marker);
      const all = (await listUserPage(ctx, { q: marker })).items.map(
        (item) => item.id,
      );
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await listUserPage(ctx, { q: marker, limit: 2, cursor });
        expect(page.total).toBe(cursor ? null : 7);
        seen.push(...page.items.map((item) => item.id));
        if (page.nextCursor)
          expect(page.nextCursor).toBe(page.items.at(-1)?.id);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(seen).toEqual(all);
      await expect(
        listUserPage(ctx, { cursor: '[true,"x","not-a-uuid"]' }),
      ).rejects.toMatchObject({ name: 'ZodError' });
    });
  });

  it.each([
    [
      'a Head Recruiter',
      { role: 'HEAD_RECRUITER', aal: 'aal2', verified: true },
      404,
      'NOT_FOUND',
    ],
    [
      'an Admin whose aal2 token has no app-side TOTP verification',
      { role: 'ADMIN', aal: 'aal2', verified: false },
      401,
      'MFA_REQUIRED',
    ],
    [
      'an aal1 Admin',
      { role: 'ADMIN', aal: 'aal1', verified: false },
      401,
      'MFA_REQUIRED',
    ],
  ] as const)('denies %s', async (_who, access, status, code) => {
    await fixture.run(async (args) => {
      const ctx = await request(args, access);
      await expect(listUserPage(ctx, {})).rejects.toMatchObject({
        status,
        code,
      });
    });
  });
});

describe('Settings → Картка користувача: detail [STORY-ROLE-05-4 AC2]', () => {
  it('returns profile, sorted roles, TL priorities per vertical and the 2FA state', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const marker = randomUUID().slice(0, 8);
      const { users, crypto } = await seedUsers(args, marker);
      await args.ctx.db.insert(schema.userRole).values({
        userId: users.active.id,
        role: 'TEAM_LEAD',
        verticalId: args.user.verticalId,
      });
      await args.ctx.db.insert(schema.teamLeadPriority).values({
        userId: users.active.id,
        verticalId: crypto,
        priority: 2,
      });
      const detail = await getUserDetail(ctx, users.active.id);
      userDetailSchema.parse(detail);
      const now = ctx.clock.now();
      expect(detail).toMatchObject({
        id: users.active.id,
        fullName: 'Ґанна Активна',
        email: users.active.email,
        status: 'ACTIVE',
        activatedAt: now.toISOString(),
        deactivatedAt: null,
        lastLoginAt: new Date(now.getTime() - HOUR).toISOString(),
        invitation: null,
        mfa: { state: 'OFF', factors: 0, lockedUntil: null },
        mfaRequired: false,
      });
      expect(detail.roles.map((r) => r.role)).toEqual([
        'RECRUITER',
        'TEAM_LEAD',
        'TEAM_LEAD',
      ]);
      expect(detail.teamLeadPriorities).toHaveLength(2);
      expect(detail.teamLeadPriorities).toEqual(
        expect.arrayContaining([
          {
            vertical: { id: crypto, name: `Крипто ${marker}` },
            priority: 2,
          },
          {
            vertical: {
              id: args.user.verticalId,
              name: `Вертикаль ${args.user.verticalId}`,
            },
            priority: null,
          },
        ]),
      );
      expect(await getUserDetail(ctx, users.locked.id)).toMatchObject({
        teamLeadPriorities: [],
        mfaRequired: true,
        mfa: { state: 'LOCKED' },
      });
    });
  });

  it('hides TL priorities from a viewer without settings.priorities.manage', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const { users, crypto } = await seedUsers(args, randomUUID().slice(0, 8));
      await args.ctx.db.insert(schema.teamLeadPriority).values({
        userId: users.active.id,
        verticalId: crypto,
        priority: 0,
      });
      expect(
        (await getUserDetail(ctx, users.active.id)).teamLeadPriorities,
      ).toHaveLength(1);
      const grants = new Map(ctx.auth.grants);
      grants.delete('settings.priorities.manage');
      const withoutPriorities = { ...ctx, auth: { ...ctx.auth, grants } };
      const detail = await getUserDetail(withoutPriorities, users.active.id);
      expect(detail.teamLeadPriorities).toEqual([]);
      expect(detail.roles.map((r) => r.role)).toContain('TEAM_LEAD');
    });
  });

  it('shows the invite block for invited, expired and revoked users only', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const { users } = await seedUsers(args, randomUUID().slice(0, 8));
      const now = ctx.clock.now().getTime();
      const detail = (id: string) => getUserDetail(ctx, id);
      expect(await detail(users.invited.id)).toMatchObject({
        status: 'INVITED',
        invitation: {
          sentAt: new Date(now - HOUR).toISOString(),
          expiresAt: new Date(now + 71 * HOUR).toISOString(),
          resendCount: 0,
          revokedAt: null,
          revokedBy: null,
        },
      });
      expect(await detail(users.expired.id)).toMatchObject({
        status: 'INVITE_EXPIRED',
        invitation: {
          sentAt: new Date(now - 100 * HOUR).toISOString(),
          revokedAt: null,
        },
      });
      expect(await detail(users.revoked.id)).toMatchObject({
        status: 'REVOKED',
        invitation: {
          revokedAt: new Date(now).toISOString(),
          revokedBy: {
            id: args.user.id,
            fullName: 'Тестовий користувач',
            isActive: true,
          },
        },
      });
      expect((await detail(users.active.id)).invitation).toBeNull();
      expect(await detail(users.deactivated.id)).toMatchObject({
        status: 'DEACTIVATED',
        invitation: null,
        mfa: { state: 'NONE' },
      });
    });
  });

  it('prefers the pending invite over an older revoked one', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const { users, crypto } = await seedUsers(args, randomUUID().slice(0, 8));
      const sentAt = new Date(ctx.clock.now().getTime() - 2 * HOUR);
      await args.ctx.db.insert(schema.userInvite).values({
        userId: users.invited.id,
        tokenHash: createHash('sha256').update(randomUUID()).digest(),
        roles: [{ role: 'RECRUITER', verticalId: crypto }],
        sentAt,
        expiresAt: new Date(sentAt.getTime() + 72 * HOUR),
        invitedBy: args.user.id,
        status: 'REVOKED',
        revokedAt: sentAt,
        revokedBy: args.user.id,
      });
      const detail = await getUserDetail(ctx, users.invited.id);
      expect(detail.invitation).toMatchObject({
        sentAt: new Date(ctx.clock.now().getTime() - HOUR).toISOString(),
        revokedAt: null,
      });
    });
  });

  it('answers 404 for unknown and malformed ids and accepts an upper-case uuid', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      for (const id of [randomUUID(), 'not-a-uuid', '1; drop table', ''])
        await expect(getUserDetail(ctx, id)).rejects.toMatchObject({
          status: 404,
        });
      for (const id of [randomUUID(), 'not-a-uuid'])
        await expect(listUserEventPage(ctx, id, {})).rejects.toMatchObject({
          status: 404,
        });
      const detail = await getUserDetail(ctx, args.user.id.toUpperCase());
      expect(detail.id).toBe(args.user.id);
    });
  });

  it.each([
    [
      'a Head Recruiter of the same vertical',
      { role: 'HEAD_RECRUITER', aal: 'aal2', verified: true },
      404,
      'NOT_FOUND',
    ],
    [
      'a verified aal2 Finance user',
      { role: 'FINANCE', aal: 'aal2', verified: true },
      404,
      'NOT_FOUND',
    ],
    [
      'an Admin whose aal2 token has no app-side TOTP verification',
      { role: 'ADMIN', aal: 'aal2', verified: false },
      401,
      'MFA_REQUIRED',
    ],
    [
      'an aal1 Admin',
      { role: 'ADMIN', aal: 'aal1', verified: false },
      401,
      'MFA_REQUIRED',
    ],
  ] as const)(
    'denies detail and history to %s',
    async (_who, access, status, code) => {
      await fixture.run(async (args) => {
        const ctx = await request(args, access);
        const target = args.user.id;
        await expect(getUserDetail(ctx, target)).rejects.toMatchObject({
          status,
          code,
        });
        await expect(listUserEventPage(ctx, target, {})).rejects.toMatchObject({
          status,
          code,
        });
      });
    },
  );
});

describe('Settings → Картка користувача: «Історія» [STORY-ROLE-05-4 AC2, HIST-03]', () => {
  it('lists only this user’s events, newest first, with actor and allowlisted summaries and no PII', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const marker = randomUUID().slice(0, 8);
      const { users, crypto } = await seedUsers(args, marker);
      const target = users.active.id;
      const start = ctx.clock.now().getTime();
      const at = (minutes: number) => {
        args.at(new Date(start + minutes * 60_000));
        return ctx;
      };
      const inviteId = randomUUID();
      await appendEvent(ctx.db, at(1), {
        type: 'user.invited',
        subjectType: 'app_user',
        subjectId: target,
        payload: {
          inviteId,
          roles: [{ role: 'RECRUITER', verticalId: args.user.verticalId }],
        },
        pii: { email: users.active.email, fullName: 'Ґанна Активна' },
      });
      await appendEvent(
        ctx.db,
        { ...at(2), auth: null },
        {
          type: 'user.activated',
          subjectType: 'app_user',
          subjectId: target,
          payload: {},
        },
      );
      await appendEvent(ctx.db, at(3), {
        type: 'user.role_assigned',
        subjectType: 'app_user',
        subjectId: target,
        payload: { role: 'TEAM_LEAD', verticalId: crypto },
      });
      await appendEvent(ctx.db, at(3), {
        type: 'user.profile_updated',
        subjectType: 'app_user',
        subjectId: target,
        payload: { fields: ['fullName'] },
        pii: { fullName: { old: 'Стара Назва', new: 'Ґанна Активна' } },
      });
      await appendEvent(ctx.db, at(4), {
        type: 'user.mfa_reset',
        subjectType: 'app_user',
        subjectId: target,
        payload: {},
        pii: { reason: 'Секретна причина скидання' },
      });
      await appendEvent(ctx.db, at(5), {
        type: 'user.activated',
        subjectType: 'app_user',
        subjectId: users.admin.id,
        payload: {},
      });

      const first = await listUserEventPage(ctx, target, { limit: 2 });
      userEventPageSchema.parse(first);
      expect(first.items.map((e) => e.type)).toEqual([
        'user.mfa_reset',
        'user.profile_updated',
      ]);
      const second = await listUserEventPage(ctx, target, {
        limit: 2,
        cursor: first.nextCursor ?? undefined,
      });
      const third = await listUserEventPage(ctx, target, {
        limit: 2,
        cursor: second.nextCursor ?? undefined,
      });
      expect(third.nextCursor).toBeNull();
      const all = [...first.items, ...second.items, ...third.items];
      expect(all.map((e) => e.type)).toEqual([
        'user.mfa_reset',
        'user.profile_updated',
        'user.role_assigned',
        'user.activated',
        'user.invited',
      ]);
      const byType = new Map(all.map((e) => [e.type, e]));
      expect(byType.get('user.mfa_reset')).toMatchObject({
        actorKind: 'USER',
        actor: {
          id: args.user.id,
          fullName: 'Тестовий користувач',
          isActive: true,
        },
        roles: null,
        fields: null,
      });
      expect(byType.get('user.activated')).toMatchObject({
        actorKind: 'SYSTEM',
        actor: null,
      });
      expect(byType.get('user.profile_updated')?.fields).toEqual(['fullName']);
      expect(byType.get('user.role_assigned')?.roles).toEqual([
        {
          role: 'TEAM_LEAD',
          vertical: { id: crypto, name: `Крипто ${marker}` },
        },
      ]);
      expect(byType.get('user.invited')?.roles).toEqual([
        {
          role: 'RECRUITER',
          vertical: {
            id: args.user.verticalId,
            name: `Вертикаль ${args.user.verticalId}`,
          },
        },
      ]);
      const serialized = JSON.stringify(all);
      for (const secret of [
        'Стара Назва',
        'Секретна причина',
        users.active.email,
        inviteId,
        'Auth integration QA',
      ])
        expect(serialized).not.toContain(secret);
      expect(Object.keys(all[0]!).sort()).toEqual(
        [
          'actor',
          'actorKind',
          'fields',
          'id',
          'occurredAt',
          'priorityChange',
          'roles',
          'type',
        ].sort(),
      );
    });
  });

  it('returns an empty page for a user without events and drops payloads that fail the allowlist', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const { users } = await seedUsers(args, randomUUID().slice(0, 8));
      expect(await listUserEventPage(ctx, users.locked.id, {})).toEqual({
        items: [],
        nextCursor: null,
      });
      await args.ctx.db.insert(schema.entityEvent).values({
        occurredAt: ctx.clock.now(),
        actorKind: 'SYSTEM',
        type: 'user.role_assigned',
        subjectType: 'app_user',
        subjectId: users.locked.id,
        payload: {
          v: 1,
          role: 'FINANCE',
          verticalId: null,
          note: 'вільний текст',
        },
      });
      const page = await listUserEventPage(ctx, users.locked.id, {});
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({ roles: null, fields: null });
      expect(JSON.stringify(page)).not.toContain('вільний текст');
    });
  });
});

describe('User timeline subject compatibility [HIST-03, CLAUDE.md §3.5]', () => {
  it('shows legacy subject "user" profile events and hides non-user event types keyed on the user', async () => {
    await fixture.run(async (args) => {
      const ctx = await adminRequest(args);
      const { users } = await seedUsers(args, randomUUID().slice(0, 8));
      const target = users.active.id;
      const row = (type: string, subjectType: string, minutes: number) => ({
        occurredAt: new Date(ctx.clock.now().getTime() + minutes * 60_000),
        actorKind: 'SYSTEM' as const,
        type,
        subjectType,
        subjectId: target,
        payload: { v: 1, fields: ['fullName'] },
      });
      await args.ctx.db
        .insert(schema.entityEvent)
        .values([
          row('user.profile_updated', 'user', 1),
          row('user.profile_updated', 'app_user', 2),
          row('settings.updated', 'app_user', 3),
          row('vertical.renamed', 'user', 4),
        ]);
      const page = await listUserEventPage(ctx, target, {});
      expect(page.items.map((e) => [e.type, e.occurredAt])).toEqual([
        [
          'user.profile_updated',
          new Date(ctx.clock.now().getTime() + 2 * 60_000).toISOString(),
        ],
        [
          'user.profile_updated',
          new Date(ctx.clock.now().getTime() + 60_000).toISOString(),
        ],
      ]);
      expect(page.items.every((e) => e.fields?.[0] === 'fullName')).toBe(true);
    });
  });
});
