import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { userPageSchema, type UserListQuery } from '../../lib/schemas/user';
import { loadAuthContext } from '../../server/context/request-context';
import * as schema from '../../server/db/schema';
import { listUserPage } from '../../server/services/user';
import { createAuthFixture } from '../support/auth-fixture';
import { startJwksFixture } from '../unit/auth/jwks-fixture';
import { connectTestDatabase, testDatabaseUrls } from './database';

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
    role: 'ADMIN' | 'HEAD_RECRUITER';
    aal: 'aal1' | 'aal2';
    verified: boolean;
  },
) {
  await args.ctx.db.insert(schema.userRole).values({
    userId: args.user.id,
    role,
    verticalId: role === 'ADMIN' ? null : args.user.verticalId,
  });
  if (verified) await args.markMfaVerified();
  const identity = { ...args.identity, aal };
  const auth = await loadAuthContext(args.ctx.db, identity, args.ctx.clock);
  return { ...args.ctx, auth, identity };
}

const HOUR = 3_600_000;

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
