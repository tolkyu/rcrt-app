import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  assertCan,
  can,
  hasAnyGrant,
  requirePermission,
} from '@/server/authz/can';
import { PERMISSIONS } from '@/server/authz/permissions';
import {
  findVisibleOrThrow,
  positionScope,
  scopeWhere,
  supportedScopes,
} from '@/server/authz/scopes';
import { BUILTIN_ROLES, type Grant } from '@/server/authz/roles';
import type {
  BuiltinRole,
  VerticalId,
  VerticalRef,
} from '@/server/authz/types';
import { NotFoundError } from '@/server/http/errors';
import {
  contextFor,
  CRYPTO,
  ECOMMERCE,
  GAMBLING,
  roleContext,
} from './fixtures';

const dialect = new PgDialect();
const render = (fragment: ReturnType<typeof scopeWhere>) =>
  dialect.sqlToQuery(fragment);
const catalog = (id: VerticalId): VerticalRef => ({ type: 'vertical', id });
const readScope = (ctx: ReturnType<typeof roleContext>) =>
  render(scopeWhere(ctx, 'position.read', positionScope));

describe('position catalog permissions [VAC-01, D76, D90, ADR-013]', () => {
  it.each([
    ['HEAD_RECRUITER', true, true],
    ['RECRUITER', true, false],
    ['TEAM_LEAD', true, false],
    ['HEAD_HR', true, false],
    ['HR', true, false],
  ] as const)(
    '%s in its own vertical: read=%s manage=%s',
    (role: BuiltinRole, read, manage) => {
      const ctx = roleContext(role);
      expect(can(ctx, 'position.read', catalog(GAMBLING))).toBe(read);
      expect(can(ctx, 'position.manage', catalog(GAMBLING))).toBe(manage);
    },
  );

  it.each([
    'HEAD_RECRUITER',
    'RECRUITER',
    'TEAM_LEAD',
    'HEAD_HR',
    'HR',
  ] as const)('%s sees nothing of another vertical', (role) => {
    const ctx = roleContext(role);
    expect(can(ctx, 'position.read', catalog(CRYPTO))).toBe(false);
    expect(can(ctx, 'position.manage', catalog(CRYPTO))).toBe(false);
    expect(readScope(ctx).params).toEqual([GAMBLING]);
  });

  it('Admin reads and manages every vertical with an aal2 session', () => {
    const admin = roleContext('ADMIN');
    for (const vertical of [GAMBLING, CRYPTO, ECOMMERCE]) {
      expect(can(admin, 'position.read', catalog(vertical))).toBe(true);
      expect(can(admin, 'position.manage', catalog(vertical))).toBe(true);
    }
    expect(readScope(admin).sql).toBe('true');
  });

  it('Admin without aal2 holds no catalog grant and is asked for MFA', () => {
    const admin = roleContext('ADMIN', 'aal1');
    expect(can(admin, 'position.read', catalog(GAMBLING))).toBe(false);
    expect(can(admin, 'position.manage', catalog(GAMBLING))).toBe(false);
    expect(hasAnyGrant(admin, 'position.read')).toBe(false);
    for (const permission of ['position.read', 'position.manage'] as const)
      expect(() => requirePermission(admin, permission)).toThrow(
        expect.objectContaining({ code: 'MFA_REQUIRED', status: 401 }),
      );
    expect(readScope(admin).sql).toBe('false');
  });

  it('an aal1 Admin who is also Head Recruiter keeps the vertical-role catalog rights only', () => {
    const ctx = contextFor(
      [
        { role: 'ADMIN', verticalId: null },
        { role: 'HEAD_RECRUITER', verticalId: GAMBLING },
      ],
      'aal1',
    );
    expect(can(ctx, 'position.manage', catalog(GAMBLING))).toBe(true);
    expect(can(ctx, 'position.manage', catalog(CRYPTO))).toBe(false);
    expect(readScope(ctx).params).toEqual([GAMBLING]);
  });

  it('Finance has no catalog access at all (route-level 404, FIN-03)', () => {
    for (const aal of ['aal1', 'aal2'] as const) {
      const finance = roleContext('FINANCE', aal);
      expect(hasAnyGrant(finance, 'position.read')).toBe(false);
      expect(can(finance, 'position.read', catalog(GAMBLING))).toBe(false);
      expect(can(finance, 'position.manage', catalog(GAMBLING))).toBe(false);
    }
    expect(() =>
      requirePermission(roleContext('FINANCE'), 'position.read'),
    ).toThrow(NotFoundError);
    expect(readScope(roleContext('FINANCE')).sql).toBe('false');
  });

  it('a Head Recruiter of another vertical cannot read or manage this one', () => {
    const other = contextFor([{ role: 'HEAD_RECRUITER', verticalId: CRYPTO }]);
    expect(can(other, 'position.read', catalog(GAMBLING))).toBe(false);
    expect(() =>
      assertCan(other, 'position.manage', catalog(GAMBLING)),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(can(other, 'position.manage', catalog(CRYPTO))).toBe(true);
  });

  it('mixed roles: Head Recruiter in one vertical and Recruiter in another read both but manage one', () => {
    const mixed = contextFor([
      { role: 'HEAD_RECRUITER', verticalId: GAMBLING },
      { role: 'RECRUITER', verticalId: CRYPTO },
    ]);
    expect(can(mixed, 'position.read', catalog(GAMBLING))).toBe(true);
    expect(can(mixed, 'position.read', catalog(CRYPTO))).toBe(true);
    expect(can(mixed, 'position.read', catalog(ECOMMERCE))).toBe(false);
    expect(can(mixed, 'position.manage', catalog(GAMBLING))).toBe(true);
    expect(can(mixed, 'position.manage', catalog(CRYPTO))).toBe(false);
    expect([...readScope(mixed).params].sort()).toEqual(
      [CRYPTO, GAMBLING].sort(),
    );
    expect(
      render(scopeWhere(mixed, 'position.manage', positionScope)).params,
    ).toEqual([GAMBLING]);
  });

  it('HR roles in two verticals read both catalogs and manage neither', () => {
    const hr = contextFor([
      { role: 'HR', verticalId: GAMBLING },
      { role: 'HEAD_HR', verticalId: CRYPTO },
    ]);
    for (const vertical of [GAMBLING, CRYPTO]) {
      expect(can(hr, 'position.read', catalog(vertical))).toBe(true);
      expect(can(hr, 'position.manage', catalog(vertical))).toBe(false);
    }
  });
});

describe('catalog page gate: «Довідник посад» is 404 without position.manage [VAC-01, VIS-02]', () => {
  it.each([
    ['ADMIN', 'aal2', true],
    ['HEAD_RECRUITER', 'aal2', true],
    ['HEAD_RECRUITER', 'aal1', true],
    ['ADMIN', 'aal1', false],
    ['RECRUITER', 'aal2', false],
    ['TEAM_LEAD', 'aal2', false],
    ['HEAD_HR', 'aal2', false],
    ['HR', 'aal2', false],
    ['FINANCE', 'aal2', false],
  ] as const)('%s (%s): page opens = %s', (role, aal, opens) => {
    expect(hasAnyGrant(roleContext(role, aal), 'position.manage')).toBe(opens);
  });

  it('a user without any role and a reader in one vertical who manages another see the page only where they manage', () => {
    expect(hasAnyGrant(contextFor([]), 'position.manage')).toBe(false);
    const mixed = contextFor([
      { role: 'RECRUITER', verticalId: GAMBLING },
      { role: 'HEAD_RECRUITER', verticalId: CRYPTO },
    ]);
    expect(hasAnyGrant(mixed, 'position.manage')).toBe(true);
    expect(can(mixed, 'position.manage', catalog(GAMBLING))).toBe(false);
    expect(can(mixed, 'position.manage', catalog(CRYPTO))).toBe(true);
  });
});

describe('position.manage invariant [SEC-POS-06, ADR-013]', () => {
  /** The manager list counts live vacancies, so managing a vertical must come with reading its catalog and its vacancies. */
  const covers = (held: Grant, needed: Grant) =>
    held.scope.kind === 'GLOBAL' || held.scope.kind === needed.scope.kind;

  it('every built-in role granting position.manage also grants position.read and vacancy.read over the same verticals', () => {
    const managers = Object.entries(BUILTIN_ROLES).filter(([, grants]) =>
      grants.some((g) => g.permission === 'position.manage'),
    );
    expect(managers.map(([role]) => role).sort()).toEqual([
      'ADMIN',
      'HEAD_RECRUITER',
    ]);
    for (const [role, grants] of managers)
      for (const manage of grants.filter(
        (g) => g.permission === 'position.manage',
      ))
        for (const permission of ['position.read', 'vacancy.read'] as const)
          expect(
            grants.some(
              (g) => g.permission === permission && covers(g, manage),
            ),
            `${role} needs ${permission}`,
          ).toBe(true);
  });
});

describe('positionScope adapter [ADR-013, SEC-CORE-05]', () => {
  it('filters on position.vertical_id with one indexed IN predicate', () => {
    const query = readScope(roleContext('HR'));
    expect(query.sql).toBe('"app"."position"."vertical_id" in ($1)');
    expect(query.params).toEqual([GAMBLING]);
  });

  it('implements exactly the scopes the position permissions allow', () => {
    const needed = new Set([
      ...PERMISSIONS['position.read'].scopes,
      ...PERMISSIONS['position.manage'].scopes,
    ]);
    expect(new Set(supportedScopes(positionScope))).toEqual(needed);
  });

  it('detail fetches use position.read: 404 without a row, and write permissions are refused', async () => {
    const seen: string[] = [];
    await expect(
      findVisibleOrThrow(
        roleContext('RECRUITER'),
        'position.read',
        positionScope,
        async (scope) => {
          seen.push(render(scope).sql);
          return null;
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(seen).toEqual(['"app"."position"."vertical_id" in ($1)']);
    await expect(
      findVisibleOrThrow(
        roleContext('HEAD_RECRUITER'),
        'position.manage' as never,
        positionScope,
        async () => ({ id: 'x' }),
      ),
    ).rejects.toThrow(/cannot scope a detail fetch/);
  });
});
