import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  assertCan,
  assertNotSelfBenefit,
  can,
  hasAnyGrant,
  permissionsFor,
  requirePermission,
} from '@/server/authz/can';
import { buildAuthContext } from '@/server/authz/context';
import {
  PERMISSIONS,
  PERMISSION_CODES,
  type PermissionCode,
} from '@/server/authz/permissions';
import { BUILTIN_ROLES, GLOBAL_ROLES } from '@/server/authz/roles';
import {
  scopeWhere,
  settingsScope,
  supportedScopes,
  userDirectoryScope,
  verticalScope,
} from '@/server/authz/scopes';
import type { BuiltinRole, ResourceType } from '@/server/authz/types';
import {
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from '@/server/http/errors';
import {
  application,
  candidate,
  contextFor,
  CRYPTO,
  GAMBLING,
  ME,
  OTHER,
  roleContext,
  vacancy,
} from './fixtures';

const dialect = new PgDialect();
const render = (fragment: ReturnType<typeof scopeWhere>) =>
  dialect.sqlToQuery(fragment);
const multiRole = contextFor([
  { role: 'HEAD_RECRUITER', verticalId: GAMBLING },
  { role: 'RECRUITER', verticalId: CRYPTO },
]);

describe('Built-in roles respect the permission registry [ROLE-04]', () => {
  it.each(Object.entries(BUILTIN_ROLES))(
    '%s grants only legal scopes',
    (role, grants) => {
      for (const { permission, scope } of grants) {
        const legal: readonly string[] = PERMISSIONS[permission].scopes;
        expect(legal, `${role} ${permission}`).toContain(scope.kind);
        expect(scope.kind === 'GLOBAL', `${role} ${permission}`).toBe(
          GLOBAL_ROLES.has(role as BuiltinRole),
        );
      }
    },
  );

  it('ignores grants from assignments with the wrong vertical shape (D40)', () => {
    const ctx = contextFor([{ role: 'HEAD_RECRUITER', verticalId: null }]);
    expect(ctx.grants.size).toBe(0);
  });

  it('ignores unknown custom roles until they are defined, and accepts them as data', () => {
    const custom = 'custom:sourcing_lead' as const;
    expect(
      contextFor([{ role: custom, verticalId: GAMBLING }]).grants.size,
    ).toBe(0);
    const ctx = buildAuthContext(
      {
        userId: ME,
        roles: [{ role: custom, verticalId: GAMBLING }],
        aal: 'aal1',
        timezone: 'Europe/Kyiv',
      },
      {
        [custom]: [
          { permission: 'candidate.read', scope: { kind: 'VERTICAL' } },
        ],
      },
    );
    expect(can(ctx, 'candidate.read', candidate())).toBe(true);
    expect(can(ctx, 'candidate.read', candidate({ verticalId: CRYPTO }))).toBe(
      false,
    );
  });
});

describe('Multi-role users get the union per vertical [ROLE-02, MR-01..07]', () => {
  it('applies Head Recruiter rights only in Гемблінг and Recruiter rights in Крипто', () => {
    expect(can(multiRole, 'candidate.read', candidate())).toBe(true);
    expect(
      can(
        multiRole,
        'candidate.read',
        candidate({ verticalId: CRYPTO, applications: [] }),
      ),
    ).toBe(false);
    expect(
      can(
        multiRole,
        'candidate.read',
        candidate({ verticalId: CRYPTO, sourcerId: ME, applications: [] }),
      ),
    ).toBe(true);
  });

  it('MR-03: cannot reassign owners in Крипто', () => {
    const crypto = application({ verticalId: CRYPTO, ownerId: ME });
    expect(can(multiRole, 'application.read', crypto)).toBe(true);
    expect(() =>
      assertCan(multiRole, 'application.reassign_owner', crypto),
    ).toThrow(ForbiddenError);
    expect(can(multiRole, 'application.reassign_owner', application())).toBe(
      true,
    );
  });

  it('MR-04: deletes an own Крипто candidate only before the TL interview', () => {
    const late = candidate({
      verticalId: CRYPTO,
      sourcerId: ME,
      applications: [
        {
          ...application({ verticalId: CRYPTO }),
          maxStageReached: 'TL_INTERVIEW',
        },
      ],
    });
    expect(can(multiRole, 'candidate.delete', late)).toBe(false);
    expect(
      can(multiRole, 'candidate.delete', { ...late, applications: [] }),
    ).toBe(true);
  });

  it('MR-07: keeps scopes apart while merging verticals of identical grants', () => {
    const vertical = multiRole.grants.get('vertical.read');
    expect(vertical).toEqual([
      {
        scope: { kind: 'VERTICAL' },
        verticalIds: [CRYPTO, GAMBLING].sort(),
        roles: ['HEAD_RECRUITER', 'RECRUITER'],
      },
    ]);
    const read = multiRole.grants.get('candidate.read')!;
    expect(read).toHaveLength(2);
    expect(
      read.find((grant) => grant.scope.kind === 'VERTICAL')?.verticalIds,
    ).toEqual([GAMBLING]);
    expect(
      read.find((grant) => grant.scope.kind === 'OWN')?.verticalIds,
    ).toEqual([CRYPTO]);
  });

  it('builds one OR-ed predicate per scope, never a cross-role vertical union', () => {
    const query = render(scopeWhere(multiRole, 'vertical.read', verticalScope));
    expect(query.sql).toBe('"app"."vertical"."id" in ($1, $2)');
    expect(query.params).toEqual([CRYPTO, GAMBLING].sort());
  });
});

describe('Finance is global and confined to Statistics [STAT-08, FIN-03, FIN-09]', () => {
  const finance = roleContext('FINANCE');
  const allowed = new Set<PermissionCode>([
    'statistics.funnel.read',
    'statistics.hr.read',
    'statistics.bonus.read',
    'statistics.export',
    'bonus.payout_report.read',
    'bonus.payout_report.export',
  ]);

  it('holds only statistics permissions', () => {
    expect(new Set(finance.grants.keys())).toEqual(allowed);
    for (const permission of PERMISSION_CODES.filter(
      (code) => !allowed.has(code),
    )) {
      expect(() => requirePermission(finance, permission)).toThrow(
        NotFoundError,
      );
    }
  });

  it('reads statistics of every vertical', () => {
    expect(
      can(finance, 'statistics.funnel.read', {
        type: 'statistics',
        verticalId: CRYPTO,
        subjectUserId: null,
      }),
    ).toBe(true);
    expect(
      can(finance, 'statistics.funnel.read', {
        type: 'statistics',
        verticalId: null,
        subjectUserId: null,
      }),
    ).toBe(true);
  });

  it('FIN-09: an extra Recruiter role adds only recruiter scope in its vertical', () => {
    const ctx = contextFor([
      { role: 'FINANCE', verticalId: null },
      { role: 'RECRUITER', verticalId: CRYPTO },
    ]);
    expect(
      can(
        ctx,
        'candidate.read',
        candidate({ verticalId: CRYPTO, sourcerId: ME, applications: [] }),
      ),
    ).toBe(true);
    expect(
      can(
        ctx,
        'candidate.read',
        candidate({ sourcerId: ME, applications: [] }),
      ),
    ).toBe(false);
    expect(
      render(scopeWhere(ctx, 'vertical.read', verticalScope)).params,
    ).toEqual([CRYPTO]);
  });
});

describe('ADMIN and FINANCE grants require an aal2 session [SEC, MFA-02..04]', () => {
  it('MFA-02: Admin with aal1 has no grants and is asked for MFA', () => {
    const admin = roleContext('ADMIN', 'aal1');
    expect(admin.grants.size).toBe(0);
    expect(admin.mfaRequired).toBe(true);
    expect(() => requirePermission(admin, 'audit.read')).toThrow(
      expect.objectContaining({ code: 'MFA_REQUIRED', status: 401 }),
    );
    expect(
      render(scopeWhere(admin, 'settings.users.manage', settingsScope)).sql,
    ).toBe('false');
  });

  it('MFA-03: Finance with aal1 is asked for MFA on statistics', () => {
    expect(() =>
      requirePermission(
        roleContext('FINANCE', 'aal1'),
        'statistics.funnel.read',
      ),
    ).toThrow(UnauthenticatedError);
  });

  it.each([
    'HEAD_RECRUITER',
    'RECRUITER',
    'HEAD_HR',
    'HR',
    'TEAM_LEAD',
  ] as const)('MFA-04: %s works with aal1', (role) => {
    const ctx = roleContext(role, 'aal1');
    expect(ctx.mfaRequired).toBe(false);
    expect(() => requirePermission(ctx, 'vertical.read')).not.toThrow();
  });

  it('keeps vertical grants of an aal1 Admin who also holds a vertical role', () => {
    const ctx = contextFor(
      [
        { role: 'ADMIN', verticalId: null },
        { role: 'HEAD_RECRUITER', verticalId: GAMBLING },
      ],
      'aal1',
    );
    expect(ctx.mfaRequired).toBe(true);
    expect(
      render(scopeWhere(ctx, 'vertical.read', verticalScope)).params,
    ).toEqual([GAMBLING]);
    expect(ctx.mfaWithheld.has('vertical.read')).toBe(false);
    expect(() => requirePermission(ctx, 'settings.verticals.manage')).toThrow(
      UnauthenticatedError,
    );
  });
});

describe('Nobody acts on their own bonus [DG-19, SB-01..13]', () => {
  const guarded = PERMISSION_CODES.filter(
    (code) => PERMISSIONS[code].selfBenefit,
  ).sort();

  it('guards exactly the footnote-7 permissions', () => {
    expect(guarded).toEqual(
      [
        'application.bonus_split.set',
        'application.reassign_owner',
        'bonus.adjust',
        'bonus.approve',
        'bonus.hold',
        'bonus.mark_paid',
        'bonus.release',
        'bonus.self_referral.approve',
      ].sort(),
    );
  });

  it.each(guarded)(
    '%s refuses a beneficiary actor and allows others',
    (permission) => {
      const admin = roleContext('ADMIN');
      expect(() =>
        assertNotSelfBenefit(admin, permission, [OTHER, ME]),
      ).toThrow(
        expect.objectContaining({
          code: 'SELF_BENEFIT_FORBIDDEN',
          status: 403,
        }),
      );
      expect(() =>
        assertNotSelfBenefit(admin, permission, [OTHER]),
      ).not.toThrow();
    },
  );

  it('SB-01: Head Recruiter may approve a tranche in the vertical but not their own', () => {
    const head = roleContext('HEAD_RECRUITER');
    const own = {
      type: 'bonus_tranche',
      id: 't',
      verticalId: GAMBLING,
      recipientId: ME,
    } as const;
    expect(can(head, 'bonus.approve', own)).toBe(true);
    expect(() =>
      assertNotSelfBenefit(head, 'bonus.approve', [own.recipientId]),
    ).toThrow(ForbiddenError);
  });

  it('does not apply to permissions without a beneficiary', () => {
    expect(() =>
      assertNotSelfBenefit(roleContext('ADMIN'), 'bonus.clawback.settle', [ME]),
    ).not.toThrow();
  });
});

describe('In-memory scope rules', () => {
  it('re-scopes closed applications left in the old vertical after a transfer (CAND-06, TR-06)', () => {
    const headHr = contextFor([{ role: 'HEAD_HR', verticalId: CRYPTO }]);
    const transferred = candidate({
      verticalId: CRYPTO,
      applications: [{ ...application(), stage: 'REJECTED' }],
    });
    expect(can(headHr, 'candidate.read', transferred)).toBe(false);
    const recruiter = roleContext('RECRUITER');
    expect(
      can(recruiter, 'candidate.read', {
        ...transferred,
        applications: [{ ...application(), ownerId: ME }],
      }),
    ).toBe(false);
  });

  it('rejects a resource type the permission is not defined for', () => {
    const admin = roleContext('ADMIN');
    expect(can(admin, 'vacancy.read', application() as never)).toBe(false);
  });

  it('permissionsFor lists the effective actions on one object', () => {
    const tl = roleContext('TEAM_LEAD');
    const submitted = application({
      teamLeadId: ME,
      maxStageReached: 'SUBMITTED_TO_TL',
      stage: 'SUBMITTED_TO_TL',
    });
    const actions = permissionsFor(tl, submitted);
    expect(actions.has('application.tl_decision')).toBe(true);
    expect(actions.has('application.move.in_work')).toBe(false);
    expect(
      permissionsFor(tl, vacancy({ teamLeadId: ME })).has('vacancy.update'),
    ).toBe(true);
  });

  it('gates routes with 404 when no grant exists', () => {
    expect(hasAnyGrant(roleContext('HR'), 'audit.read')).toBe(false);
    expect(() => requirePermission(roleContext('HR'), 'audit.read')).toThrow(
      NotFoundError,
    );
  });
});

describe('Scoped SQL predicates [VIS-02]', () => {
  it('renders true for GLOBAL, false without a grant, and indexed predicates otherwise', () => {
    expect(
      render(scopeWhere(roleContext('ADMIN'), 'vertical.read', verticalScope))
        .sql,
    ).toBe('true');
    expect(
      render(scopeWhere(roleContext('FINANCE'), 'vertical.read', verticalScope))
        .sql,
    ).toBe('false');
    expect(
      render(scopeWhere(roleContext('HR'), 'audit.read', settingsScope)).sql,
    ).toBe('false');
    expect(
      render(scopeWhere(roleContext('ADMIN'), 'audit.read', settingsScope)).sql,
    ).toBe('true');
    const directory = render(
      scopeWhere(
        roleContext('TEAM_LEAD'),
        'user.directory.read',
        userDirectoryScope,
      ),
    );
    expect(directory.sql).toBe(
      'exists (select 1 from "app"."user_role" where "app"."user_role"."user_id" = "app"."app_user"."id" and "app"."user_role"."vertical_id" in ($1))',
    );
    expect(directory.params).toEqual([GAMBLING]);
  });

  it.each([
    ['vertical', verticalScope],
    ['user', userDirectoryScope],
    ['settings', settingsScope],
  ] as const)(
    '%s adapter implements every scope its permissions allow',
    (resource, adapter) => {
      const needed = new Set(
        PERMISSION_CODES.filter((code) =>
          (PERMISSIONS[code].resources as readonly ResourceType[]).includes(
            resource,
          ),
        ).flatMap((code) => PERMISSIONS[code].scopes),
      );
      expect(new Set(supportedScopes(adapter))).toEqual(needed);
    },
  );

  it('drops custom grants whose scope the registry does not allow (ROLE-04 validation)', () => {
    const ctx = buildAuthContext(
      {
        userId: ME,
        roles: [{ role: 'custom:auditor', verticalId: GAMBLING }],
        aal: 'aal1',
        timezone: 'Europe/Kyiv',
      },
      {
        'custom:auditor': [
          { permission: 'audit.read', scope: { kind: 'VERTICAL' } },
        ],
      },
    );
    expect(ctx.grants.size).toBe(0);
    expect(render(scopeWhere(ctx, 'audit.read', settingsScope)).sql).toBe(
      'false',
    );
  });
});
