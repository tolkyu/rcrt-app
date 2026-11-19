import { describe, expect, it } from 'vitest';
import type { AuthContext } from '@/server/authz/context';
import type { PermissionCode } from '@/server/authz/permissions';
import type { BuiltinRole, Scope, VerticalId } from '@/server/authz/types';
import {
  canAssignRecruiters,
  canSelfAssign,
  canSetTeamLead,
  hasGrantCovering,
  hasOwnGrant,
  isTeamEditable,
  selfAssignVerticals,
} from '@/server/authz/vacancy-assignment';
import {
  contextFor,
  CRYPTO,
  GAMBLING,
  ME,
  OTHER,
  ROLE_COLUMNS,
  roleContext,
} from './fixtures';

const MANAGERS: readonly BuiltinRole[] = ['ADMIN', 'HEAD_RECRUITER'];
const open = { verticalId: GAMBLING, status: 'OPEN' } as const;
const NARROW_SCOPES = [
  'OWN',
  'OWN_INITIATED_NEW',
  'ASSIGNED',
  'UNASSIGNED_OPEN',
  'SUBMITTED_TO_ME',
] as const;

/** A caller whose only grant is `permission` at `scope`, as a custom role would give it; the vertical is always covered, so only the scope kind can refuse. */
const holding = (
  permission: PermissionCode,
  scope: Scope,
  verticalIds: readonly VerticalId[] | 'ALL' = [GAMBLING],
): AuthContext => ({
  userId: ME,
  grants: new Map([[permission, [{ scope, verticalIds }]]]),
  aal: 'aal2',
  mfaRequired: false,
  mfaWithheld: new Set(),
  mfaWithheldGrants: new Map(),
  timezone: 'Europe/Kyiv',
});

describe('team editing statuses [D130]', () => {
  it.each([
    ['DRAFT', false],
    ['OPEN', true],
    ['ON_HOLD', true],
    ['FILLED', false],
    ['CANCELLED', false],
  ] as const)('%s: %s', (status, expected) => {
    expect(isTeamEditable(status)).toBe(expected);
  });
});

describe('grant helpers [STORY-VAC-03-1]', () => {
  it.each(ROLE_COLUMNS)(
    '%s: covering vacancy.hold only for Admin and Head Recruiter',
    (role) => {
      expect(
        hasGrantCovering(roleContext(role), 'vacancy.hold', GAMBLING),
      ).toBe(MANAGERS.includes(role));
    },
  );

  it('Head Recruiter covers the own vertical only', () => {
    const auth = roleContext('HEAD_RECRUITER');
    expect(hasGrantCovering(auth, 'vacancy.hold', GAMBLING)).toBe(true);
    expect(hasGrantCovering(auth, 'vacancy.hold', CRYPTO)).toBe(false);
  });

  it('Admin without aal2 covers nothing', () => {
    expect(
      hasGrantCovering(roleContext('ADMIN', 'aal1'), 'vacancy.hold', GAMBLING),
    ).toBe(false);
  });

  it('the OWN grant is valid only on a vacancy whose Team Lead is the caller', () => {
    const auth = roleContext('TEAM_LEAD');
    expect(hasOwnGrant(auth, 'vacancy.hold', GAMBLING, ME)).toBe(true);
    expect(hasOwnGrant(auth, 'vacancy.hold', GAMBLING, OTHER)).toBe(false);
    expect(hasOwnGrant(auth, 'vacancy.hold', GAMBLING, null)).toBe(false);
    expect(hasOwnGrant(auth, 'vacancy.hold', CRYPTO, ME)).toBe(false);
  });

  it('no OWN grant without the permission', () => {
    expect(
      hasOwnGrant(roleContext('TEAM_LEAD'), 'vacancy.reopen', GAMBLING, ME),
    ).toBe(false);
  });

  it.each(ROLE_COLUMNS.filter((role) => role !== 'TEAM_LEAD'))(
    '%s never has an OWN hold grant',
    (role) => {
      expect(hasOwnGrant(roleContext(role), 'vacancy.hold', GAMBLING, ME)).toBe(
        false,
      );
    },
  );
});

describe('canAssignRecruiters and canSetTeamLead [D130-1, D130-3]', () => {
  it.each(ROLE_COLUMNS)('%s on an OPEN vacancy without a Team Lead', (role) => {
    const auth = roleContext(role);
    const expected = MANAGERS.includes(role);
    expect(canAssignRecruiters(auth, open)).toBe(expected);
    expect(canSetTeamLead(auth, { ...open, teamLead: null })).toBe(expected);
  });

  it.each([
    ['DRAFT', false],
    ['OPEN', true],
    ['ON_HOLD', true],
    ['FILLED', false],
    ['CANCELLED', false],
  ] as const)('Head Recruiter on %s: %s', (status, expected) => {
    const auth = roleContext('HEAD_RECRUITER');
    const vacancy = { verticalId: GAMBLING, status };
    expect(canAssignRecruiters(auth, vacancy)).toBe(expected);
    expect(canSetTeamLead(auth, { ...vacancy, teamLead: null })).toBe(expected);
  });

  it('a set Team Lead hides the Team Lead action but not the recruiter one', () => {
    const auth = roleContext('HEAD_RECRUITER');
    expect(canSetTeamLead(auth, { ...open, teamLead: { id: OTHER } })).toBe(
      false,
    );
    expect(canAssignRecruiters(auth, open)).toBe(true);
  });

  it('Head Recruiter of another vertical and Admin without aal2 get nothing', () => {
    const crypto = { verticalId: CRYPTO, status: 'OPEN' } as const;
    const head = roleContext('HEAD_RECRUITER');
    expect(canAssignRecruiters(head, crypto)).toBe(false);
    expect(canSetTeamLead(head, { ...crypto, teamLead: null })).toBe(false);
    expect(canAssignRecruiters(roleContext('ADMIN', 'aal1'), open)).toBe(false);
  });
});

describe('canSelfAssign [D1, D130]', () => {
  it.each(ROLE_COLUMNS)('%s on an unassigned OPEN vacancy', (role) => {
    expect(canSelfAssign(roleContext(role), { ...open, recruiters: [] })).toBe(
      role === 'RECRUITER',
    );
  });

  it.each([
    ['OPEN', [], true],
    ['OPEN', [{}], false],
    ['ON_HOLD', [], false],
    ['DRAFT', [], false],
    ['FILLED', [], false],
    ['CANCELLED', [], false],
  ] as const)(
    'Recruiter on %s with %j recruiters: %s',
    (status, recruiters, expected) => {
      expect(
        canSelfAssign(roleContext('RECRUITER'), {
          verticalId: GAMBLING,
          status,
          recruiters,
        }),
      ).toBe(expected);
    },
  );

  it('a Recruiter of another vertical cannot claim', () => {
    expect(
      canSelfAssign(roleContext('RECRUITER'), {
        verticalId: CRYPTO,
        status: 'OPEN',
        recruiters: [],
      }),
    ).toBe(false);
  });

  it('a Recruiter who is also Team Lead (D35) may claim in the vertical', () => {
    const auth = contextFor([
      { role: 'RECRUITER', verticalId: GAMBLING },
      { role: 'TEAM_LEAD', verticalId: GAMBLING },
    ]);
    expect(canSelfAssign(auth, { ...open, recruiters: [] })).toBe(true);
  });

  it('a Team Lead alone cannot claim', () => {
    expect(
      canSelfAssign(roleContext('TEAM_LEAD'), { ...open, recruiters: [] }),
    ).toBe(false);
  });
});

describe('selfAssignVerticals: what the list page sends to the claim button [D130-2, security L-1]', () => {
  it('Recruiter of one vertical gets that vertical', () => {
    expect(selfAssignVerticals(roleContext('RECRUITER'))).toEqual([GAMBLING]);
  });

  it('Recruiter of two verticals gets both', () => {
    const auth = contextFor([
      { role: 'RECRUITER', verticalId: GAMBLING },
      { role: 'RECRUITER', verticalId: CRYPTO },
    ]);
    expect(selfAssignVerticals(auth)).toEqual(
      expect.arrayContaining([GAMBLING, CRYPTO]),
    );
    expect(selfAssignVerticals(auth)).toHaveLength(2);
  });

  it('Recruiter in one vertical and Team Lead in another gets only the Recruiter one', () => {
    const auth = contextFor([
      { role: 'RECRUITER', verticalId: GAMBLING },
      { role: 'TEAM_LEAD', verticalId: CRYPTO },
    ]);
    expect(selfAssignVerticals(auth)).toEqual([GAMBLING]);
  });

  it.each([
    ['Admin with aal2', roleContext('ADMIN')],
    ['Admin with aal1', roleContext('ADMIN', 'aal1')],
    ['Head Recruiter', roleContext('HEAD_RECRUITER')],
    ['Team Lead', roleContext('TEAM_LEAD')],
    ['HR', roleContext('HR')],
    ['Finance', roleContext('FINANCE')],
    ['a user with no assignments', contextFor([])],
  ])(
    '%s gets no vertical (they assign through a manager grant, not by claiming)',
    (_name, auth) => {
      expect(selfAssignVerticals(auth)).toEqual([]);
    },
  );
});

describe('only GLOBAL and VERTICAL grants cover, by scope kind and not by role name [S1-5, A1]', () => {
  it.each(['GLOBAL', 'VERTICAL'] as const)(
    'a %s grant covers the vertical and enables the team actions',
    (kind) => {
      expect(
        hasGrantCovering(
          holding('vacancy.hold', { kind }),
          'vacancy.hold',
          GAMBLING,
        ),
      ).toBe(true);
      expect(
        canAssignRecruiters(
          holding('vacancy.assign_recruiters', { kind }),
          open,
        ),
      ).toBe(true);
      expect(
        canSetTeamLead(holding('vacancy.team_lead.set', { kind }), {
          ...open,
          teamLead: null,
        }),
      ).toBe(true);
    },
  );

  it.each(
    NARROW_SCOPES.flatMap(
      (kind) =>
        [
          [kind, [GAMBLING]],
          [kind, 'ALL'],
        ] as const,
    ),
  )(
    'a %s grant covering %j never covers: hold, assign and Team Lead stay refused',
    (kind, verticalIds) => {
      const scope = { kind } as Scope;
      expect(
        hasGrantCovering(
          holding('vacancy.hold', scope, verticalIds),
          'vacancy.hold',
          GAMBLING,
        ),
      ).toBe(false);
      expect(
        canAssignRecruiters(
          holding('vacancy.assign_recruiters', scope, verticalIds),
          open,
        ),
      ).toBe(false);
      expect(
        canSetTeamLead(holding('vacancy.team_lead.set', scope, verticalIds), {
          ...open,
          teamLead: null,
        }),
      ).toBe(false);
    },
  );

  it('the OWN hold grant works through hasOwnGrant only, never through hasGrantCovering', () => {
    const auth = holding('vacancy.hold', { kind: 'OWN' });
    expect(hasGrantCovering(auth, 'vacancy.hold', GAMBLING)).toBe(false);
    expect(hasOwnGrant(auth, 'vacancy.hold', GAMBLING, ME)).toBe(true);
    expect(hasOwnGrant(auth, 'vacancy.hold', GAMBLING, OTHER)).toBe(false);
  });

  it('a covering grant of another vertical does not cover this one', () => {
    expect(
      hasGrantCovering(
        holding('vacancy.hold', { kind: 'VERTICAL' }, [CRYPTO]),
        'vacancy.hold',
        GAMBLING,
      ),
    ).toBe(false);
  });
});

describe('canSelfAssign never offers a claim outside OPEN, also with several roles [S1-5, D35]', () => {
  const both = contextFor([
    { role: 'RECRUITER', verticalId: GAMBLING },
    { role: 'TEAM_LEAD', verticalId: GAMBLING },
  ]);

  it.each(['DRAFT', 'ON_HOLD', 'FILLED', 'CANCELLED'] as const)(
    'a Recruiter who is also Team Lead on an unassigned %s vacancy',
    (status) => {
      expect(
        canSelfAssign(both, { verticalId: GAMBLING, status, recruiters: [] }),
      ).toBe(false);
    },
  );
});
