import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  assertCan,
  assertCanActOn,
  beneficiariesOf,
  canActOn,
  can,
  hasAnyGrant,
  permissionsFor,
  requirePermission,
} from '@/server/authz/can';
import { buildAuthContext, requiresMfa } from '@/server/authz/context';
import {
  PERMISSIONS,
  PERMISSION_CODES,
  type PermissionCode,
} from '@/server/authz/permissions';
import { BUILTIN_ROLES, GLOBAL_ROLES } from '@/server/authz/roles';
import {
  findVisibleOrThrow,
  scopeWhere,
  settingsScope,
  supportedScopes,
  userDirectoryScope,
  verticalScope,
} from '@/server/authz/scopes';
import type { BuiltinRole, ResourceType } from '@/server/authz/types';
import { NotFoundError, UnauthenticatedError } from '@/server/http/errors';
import {
  appFacts,
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
      assertCanActOn(multiRole, 'application.reassign_owner', crypto, [OTHER]),
    ).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(
      canActOn(multiRole, 'application.reassign_owner', application(), [OTHER]),
    ).toBe(true);
  });

  it('MR-04: deletes candidates only where Head Recruiter (D65)', () => {
    const ownCrypto = candidate({
      verticalId: CRYPTO,
      sourcerId: ME,
      applications: [],
    });
    expect(can(multiRole, 'candidate.read', ownCrypto)).toBe(true);
    expect(can(multiRole, 'candidate.delete', ownCrypto)).toBe(false);
    expect(can(multiRole, 'candidate.delete', candidate())).toBe(true);
  });

  it('MR-07: keeps scopes apart while merging verticals of identical grants', () => {
    const vertical = multiRole.grants.get('vertical.read');
    expect(vertical).toEqual([
      {
        scope: { kind: 'VERTICAL' },
        verticalIds: [CRYPTO, GAMBLING].sort(),
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

describe('Nobody acts on their own bonus [DG-19, SB-01..13, SEC-CORE-01, SEC-CORE-04]', () => {
  const guarded = PERMISSION_CODES.filter(
    (code) => PERMISSIONS[code].selfBenefit,
  ).sort();
  const tranche = (recipientId: typeof ME) =>
    ({
      type: 'bonus_tranche',
      id: 't',
      verticalId: GAMBLING,
      recipientId,
    }) as const;

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
        'candidate.bonus_flags.clear',
      ].sort(),
    );
  });

  it('refuses self-benefit permissions through can/assertCan even when types are bypassed', () => {
    const admin = roleContext('ADMIN');
    for (const permission of guarded) {
      expect(() =>
        can(admin, permission as 'vacancy.read', tranche(OTHER) as never),
      ).toThrow(/assertCanActOn/);
      expect(() =>
        assertCan(admin, permission as 'vacancy.read', tranche(OTHER) as never),
      ).toThrow(/assertCanActOn/);
    }
  });

  it.each([
    'bonus.approve',
    'bonus.hold',
    'bonus.release',
    'bonus.mark_paid',
    'bonus.adjust',
    'bonus.self_referral.approve',
  ] as const)(
    '%s: Admin acts on another recipient, never on their own tranche',
    (permission) => {
      const admin = roleContext('ADMIN');
      expect(() =>
        assertCanActOn(admin, permission, tranche(OTHER), []),
      ).not.toThrow();
      expect(() => assertCanActOn(admin, permission, tranche(ME), [])).toThrow(
        expect.objectContaining({
          code: 'SELF_BENEFIT_FORBIDDEN',
          status: 403,
        }),
      );
    },
  );

  it('SB-01: Head Recruiter approves in the vertical but not their own tranche', () => {
    const head = roleContext('HEAD_RECRUITER');
    expect(canActOn(head, 'bonus.approve', tranche(OTHER), [])).toBe(true);
    expect(canActOn(head, 'bonus.approve', tranche(ME), [])).toBe(false);
    expect(permissionsFor(head, tranche(ME)).has('bonus.approve')).toBe(false);
    expect(permissionsFor(head, tranche(OTHER)).has('bonus.approve')).toBe(
      true,
    );
  });

  it('SB-11/13: split and reassign check old and new beneficiaries', () => {
    const head = roleContext('HEAD_RECRUITER');
    expect(() =>
      assertCanActOn(
        head,
        'application.reassign_owner',
        application({ ownerId: ME }),
        [OTHER],
      ),
    ).toThrow(expect.objectContaining({ code: 'SELF_BENEFIT_FORBIDDEN' }));
    expect(() =>
      assertCanActOn(head, 'application.reassign_owner', application(), [ME]),
    ).toThrow(expect.objectContaining({ code: 'SELF_BENEFIT_FORBIDDEN' }));
    expect(
      canActOn(
        head,
        'application.bonus_split.set',
        application({ splitRecipientIds: [ME] }),
        [OTHER],
      ),
    ).toBe(false);
    expect(
      canActOn(head, 'application.bonus_split.set', application(), [OTHER]),
    ).toBe(true);
  });

  describe('D66: bonus-relevant candidate flags', () => {
    it('lets the own Recruiter and the Head Recruiter set a flag, nobody else', () => {
      expect(
        can(
          roleContext('RECRUITER'),
          'candidate.bonus_flags.set',
          candidate({ sourcerId: ME }),
        ),
      ).toBe(true);
      expect(
        can(roleContext('RECRUITER'), 'candidate.bonus_flags.set', candidate()),
      ).toBe(false);
      expect(
        can(
          roleContext('HEAD_RECRUITER'),
          'candidate.bonus_flags.set',
          candidate(),
        ),
      ).toBe(true);
      for (const role of ['HEAD_HR', 'HR', 'TEAM_LEAD', 'FINANCE'] as const) {
        expect(
          hasAnyGrant(roleContext(role), 'candidate.bonus_flags.set'),
          role,
        ).toBe(false);
      }
    });

    it('allows only an aal2 Admin to clear a flag', () => {
      for (const role of [
        'HEAD_RECRUITER',
        'RECRUITER',
        'HEAD_HR',
        'HR',
        'TEAM_LEAD',
        'FINANCE',
      ] as const) {
        expect(
          canActOn(
            roleContext(role),
            'candidate.bonus_flags.clear',
            candidate(),
            [],
          ),
          role,
        ).toBe(false);
      }
      expect(() =>
        assertCanActOn(
          roleContext('HEAD_RECRUITER'),
          'candidate.bonus_flags.clear',
          candidate({ sourcerId: ME }),
          [],
        ),
      ).toThrow(expect.objectContaining({ code: 'FORBIDDEN', status: 403 }));
      expect(
        canActOn(
          roleContext('ADMIN', 'aal1'),
          'candidate.bonus_flags.clear',
          candidate(),
          [],
        ),
      ).toBe(false);
      expect(() =>
        assertCanActOn(
          roleContext('ADMIN'),
          'candidate.bonus_flags.clear',
          candidate(),
          [],
        ),
      ).not.toThrow();
    });

    it.each([
      ['the sourcer', candidate({ sourcerId: ME })],
      ['the talent-pool owner', candidate({ ownerId: ME })],
      [
        'an application owner',
        candidate({ applications: [appFacts({ ownerId: ME })] }),
      ],
      [
        'an application sourcer',
        candidate({ applications: [appFacts({ sourcerId: ME })] }),
      ],
      [
        'a split recipient',
        candidate({ applications: [appFacts({ splitRecipientIds: [ME] })] }),
      ],
    ])(
      'refuses an Admin who is %s with SELF_BENEFIT_FORBIDDEN',
      (_who, target) => {
        expect(beneficiariesOf(target)).toContain(ME);
        expect(() =>
          assertCanActOn(
            roleContext('ADMIN'),
            'candidate.bonus_flags.clear',
            target,
            [],
          ),
        ).toThrow(
          expect.objectContaining({
            code: 'SELF_BENEFIT_FORBIDDEN',
            status: 403,
          }),
        );
      },
    );
  });
});

describe('Delete scopes and Team Lead ownership [D65, D13, D67]', () => {
  const recruiter = roleContext('RECRUITER');
  it('D65: Recruiters never delete candidates, even their own before any interview', () => {
    const own = candidate({
      sourcerId: ME,
      applications: [
        appFacts({ stage: 'NEW', maxStageReached: 'NEW', ownerId: ME }),
      ],
    });
    expect(can(recruiter, 'candidate.read', own)).toBe(true);
    expect(can(recruiter, 'candidate.delete', own)).toBe(false);
    expect(can(roleContext('HEAD_RECRUITER'), 'candidate.delete', own)).toBe(
      true,
    );
  });

  it('vacancy (D13): only the creator, recruiter-initiated, with no application past NEW', () => {
    const own = vacancy({
      createdBy: ME,
      recruiterInitiated: true,
      assignedRecruiterIds: [ME],
    });
    expect(can(recruiter, 'vacancy.delete', own)).toBe(true);
    expect(
      can(recruiter, 'vacancy.delete', { ...own, maxApplicationStage: 'NEW' }),
    ).toBe(true);
    expect(
      can(recruiter, 'vacancy.delete', {
        ...own,
        maxApplicationStage: 'IN_WORK',
      }),
    ).toBe(false);
    expect(
      can(recruiter, 'vacancy.delete', { ...own, recruiterInitiated: false }),
    ).toBe(false);
    expect(can(recruiter, 'vacancy.delete', { ...own, createdBy: OTHER })).toBe(
      false,
    );
  });

  it('Team Lead loses a vacancy they created once it is reassigned to another Team Lead', () => {
    const teamLead = roleContext('TEAM_LEAD');
    const reassigned = vacancy({ createdBy: ME, teamLeadId: OTHER });
    for (const permission of [
      'vacancy.read',
      'vacancy.update',
      'vacancy.hold',
      'vacancy.resume',
      'vacancy.cancel',
    ] as const) {
      expect(can(teamLead, permission, reassigned), permission).toBe(false);
      expect(
        can(teamLead, permission, vacancy({ teamLeadId: ME })),
        permission,
      ).toBe(true);
    }
  });
});

describe('MFA follows the permission, custom roles are vertical-bound [SEC-CORE-08, SEC-CORE-09, SEC-CORE-12]', () => {
  it('exposes no raw role assignments on the auth context', () => {
    expect('roles' in roleContext('ADMIN')).toBe(false);
  });

  it('flags every settings, audit, purge and Admin-only bonus write as MFA-only', () => {
    for (const code of PERMISSION_CODES) {
      const definition = PERMISSIONS[code];
      const resources: readonly ResourceType[] = definition.resources;
      if (
        code.startsWith('settings.') ||
        code === 'audit.read' ||
        code === 'candidate.purge' ||
        (resources.includes('bonus_tranche') &&
          definition.write &&
          definition.scopes.every((kind) => kind === 'GLOBAL'))
      ) {
        expect(definition.mfa, code).toBe(true);
      }
    }
  });

  it('keeps grants that are not MFA-flagged for a vertical-bound custom role at aal1', () => {
    const ctx = buildAuthContext(
      {
        userId: ME,
        roles: [{ role: 'custom:payroll', verticalId: GAMBLING }],
        aal: 'aal1',
        timezone: 'Europe/Kyiv',
      },
      {
        'custom:payroll': [
          { permission: 'bonus.approve', scope: { kind: 'VERTICAL' } },
          { permission: 'candidate.read', scope: { kind: 'VERTICAL' } },
        ],
      },
    );
    expect(ctx.mfaRequired).toBe(false);
    expect(can(ctx, 'candidate.read', candidate())).toBe(true);
    expect(canActOn(ctx, 'bonus.approve', tranche(), [])).toBe(true);
    function tranche() {
      return {
        type: 'bonus_tranche',
        id: 't',
        verticalId: GAMBLING,
        recipientId: OTHER,
      } as const;
    }
  });

  it('ignores global custom roles and invalid role codes', () => {
    const global = buildAuthContext(
      {
        userId: ME,
        roles: [{ role: 'custom:superuser', verticalId: null }],
        aal: 'aal2',
        timezone: 'Europe/Kyiv',
      },
      {
        'custom:superuser': [
          { permission: 'settings.users.manage', scope: { kind: 'GLOBAL' } },
        ],
      },
    );
    expect(global.grants.size).toBe(0);
    const invalid = buildAuthContext({
      userId: ME,
      roles: [
        { role: '__proto__', verticalId: GAMBLING },
        { role: 'SUPERUSER', verticalId: null },
        { role: 'ADMIN', verticalId: GAMBLING },
        { role: 'RECRUITER', verticalId: null },
      ],
      aal: 'aal2',
      timezone: 'Europe/Kyiv',
    });
    expect(invalid.grants.size).toBe(0);
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

describe('Detail fetches are scoped by read permissions only [SEC-CORE-05]', () => {
  it('computes the scope from the read grant and answers 404 without a row', async () => {
    const seen: string[] = [];
    const load = async (scope: Parameters<typeof render>[0]) => {
      seen.push(render(scope).sql);
      return null;
    };
    await expect(
      findVisibleOrThrow(
        roleContext('HR'),
        'vertical.read',
        verticalScope,
        load,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(seen).toEqual(['"app"."vertical"."id" in ($1)']);
    await expect(
      findVisibleOrThrow(
        roleContext('ADMIN'),
        'vertical.read',
        verticalScope,
        async () => ({ id: 'x' }),
      ),
    ).resolves.toEqual({ id: 'x' });
  });

  it('refuses a write permission even when types are bypassed', async () => {
    await expect(
      findVisibleOrThrow(
        roleContext('ADMIN'),
        'settings.users.manage' as never,
        settingsScope,
        async () => ({ id: 'x' }),
      ),
    ).rejects.toThrow(/cannot scope a detail fetch/);
  });
});

describe('requiresMfa follows the grants, not role names [SEC-CORE-09]', () => {
  it.each([
    ['ADMIN', 'aal1', true],
    ['ADMIN', 'aal2', true],
    ['FINANCE', 'aal2', true],
    ['HEAD_RECRUITER', 'aal1', false],
    ['TEAM_LEAD', 'aal2', false],
  ] as const)('%s at %s → %s', (role, aal, expected) => {
    expect(requiresMfa(roleContext(role, aal))).toBe(expected);
  });
});
