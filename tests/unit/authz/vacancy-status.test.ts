import { describe, expect, it } from 'vitest';
import {
  VACANCY_STATUS_ACTIONS,
  type VacancyStatusAction,
} from '@/server/domain/vacancy-status/transitions';
import type { BuiltinRole, VacancyStatus } from '@/server/authz/types';
import {
  mayRequestStatusAction,
  permittedStatusActions,
  statusGrantMirror,
} from '@/server/authz/vacancy-status';
import { rowStatusActions } from '@/lib/vacancy-status-menu';
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
const NO_GRANT = ['RECRUITER', 'HR', 'HEAD_HR', 'FINANCE'] as const;
const own = { verticalId: GAMBLING, teamLeadId: ME };
const foreign = { verticalId: GAMBLING, teamLeadId: OTHER };
const STATUSES: readonly VacancyStatus[] = [
  'DRAFT',
  'OPEN',
  'ON_HOLD',
  'FILLED',
  'CANCELLED',
];

describe('who may request a status action [STORY-VAC-02-1, D130-4]', () => {
  it.each(ROLE_COLUMNS)('%s on a vacancy led by someone else', (role) => {
    for (const action of VACANCY_STATUS_ACTIONS)
      expect(mayRequestStatusAction(roleContext(role), foreign, action)).toBe(
        MANAGERS.includes(role),
      );
  });

  it.each(VACANCY_STATUS_ACTIONS)(
    'Team Lead on the own vacancy, %s',
    (action) => {
      expect(
        mayRequestStatusAction(roleContext('TEAM_LEAD'), own, action),
      ).toBe(action !== 'REOPEN');
    },
  );

  it('Team Lead on a vacancy without a lead gets nothing', () => {
    for (const action of VACANCY_STATUS_ACTIONS)
      expect(
        mayRequestStatusAction(
          roleContext('TEAM_LEAD'),
          { verticalId: GAMBLING, teamLeadId: null },
          action,
        ),
      ).toBe(false);
  });

  it.each(NO_GRANT)(
    '%s is refused even when named as the Team Lead',
    (role) => {
      for (const action of VACANCY_STATUS_ACTIONS)
        expect(mayRequestStatusAction(roleContext(role), own, action)).toBe(
          false,
        );
    },
  );

  it('Head Recruiter of another vertical and Admin without aal2 are refused', () => {
    for (const action of VACANCY_STATUS_ACTIONS) {
      expect(
        mayRequestStatusAction(
          roleContext('HEAD_RECRUITER'),
          { verticalId: CRYPTO, teamLeadId: OTHER },
          action,
        ),
      ).toBe(false);
      expect(
        mayRequestStatusAction(roleContext('ADMIN', 'aal1'), foreign, action),
      ).toBe(false);
    }
  });

  it('Team Lead in one vertical and Head Recruiter in another: each grant applies in its own vertical', () => {
    const auth = contextFor([
      { role: 'TEAM_LEAD', verticalId: GAMBLING },
      { role: 'HEAD_RECRUITER', verticalId: CRYPTO },
    ]);
    expect(mayRequestStatusAction(auth, own, 'HOLD')).toBe(true);
    expect(mayRequestStatusAction(auth, own, 'REOPEN')).toBe(false);
    expect(mayRequestStatusAction(auth, foreign, 'HOLD')).toBe(false);
    const crypto = { verticalId: CRYPTO, teamLeadId: OTHER };
    expect(mayRequestStatusAction(auth, crypto, 'REOPEN')).toBe(true);
  });
});

describe('statusActions of the detail [STORY-VAC-02-1]', () => {
  const MANAGER: Record<VacancyStatus, readonly VacancyStatusAction[]> = {
    DRAFT: [],
    OPEN: ['HOLD', 'CANCEL'],
    ON_HOLD: ['RESUME', 'CANCEL'],
    FILLED: ['REOPEN'],
    CANCELLED: [],
  };
  const TEAM_LEAD: Record<VacancyStatus, readonly VacancyStatusAction[]> = {
    ...MANAGER,
    FILLED: [],
  };

  it.each(STATUSES)('Admin and Head Recruiter on %s', (status) => {
    for (const role of MANAGERS)
      expect(
        permittedStatusActions(roleContext(role), { ...foreign, status }),
      ).toEqual(MANAGER[status]);
  });

  it.each(STATUSES)('Team Lead on %s: own vacancy, then another', (status) => {
    const auth = roleContext('TEAM_LEAD');
    expect(permittedStatusActions(auth, { ...own, status })).toEqual(
      TEAM_LEAD[status],
    );
    expect(permittedStatusActions(auth, { ...foreign, status })).toEqual([]);
  });

  it.each(NO_GRANT)('%s never gets an action', (role) => {
    for (const status of STATUSES)
      expect(
        permittedStatusActions(roleContext(role), { ...own, status }),
      ).toEqual([]);
  });
});

describe('statusGrantMirror: what the list page sends to the row menu [STORY-VAC-02-1, D130-4]', () => {
  const ALL = { HOLD: 'ALL', RESUME: 'ALL', CANCEL: 'ALL', REOPEN: 'ALL' };
  const only = (...ids: string[]) => ({
    HOLD: ids,
    RESUME: ids,
    CANCEL: ids,
    REOPEN: ids,
  });
  const NOTHING = only();

  it('Admin with aal2 holds every action everywhere', () => {
    const mirror = statusGrantMirror(roleContext('ADMIN'));
    expect(mirror).toEqual({ viewerId: ME, covering: ALL, own: NOTHING });
  });

  it('Admin with aal1 gets nothing: the global grants are withheld until MFA', () => {
    expect(statusGrantMirror(roleContext('ADMIN', 'aal1'))).toBeNull();
  });

  it('Head Recruiter of one vertical gets that vertical for all four actions', () => {
    expect(statusGrantMirror(roleContext('HEAD_RECRUITER'))).toEqual({
      viewerId: ME,
      covering: only(GAMBLING),
      own: NOTHING,
    });
  });

  it('Head Recruiter of one vertical and Team Lead of another keep their grants apart', () => {
    const mirror = statusGrantMirror(
      contextFor([
        { role: 'HEAD_RECRUITER', verticalId: GAMBLING },
        { role: 'TEAM_LEAD', verticalId: CRYPTO },
      ]),
    );
    expect(mirror?.covering).toEqual(only(GAMBLING));
    expect(mirror?.own).toEqual({
      HOLD: [CRYPTO],
      RESUME: [CRYPTO],
      CANCEL: [CRYPTO],
      REOPEN: [],
    });
  });

  it('Team Lead holds hold, resume and cancel as OWN grants only, never reopen', () => {
    expect(statusGrantMirror(roleContext('TEAM_LEAD'))).toEqual({
      viewerId: ME,
      covering: NOTHING,
      own: {
        HOLD: [GAMBLING],
        RESUME: [GAMBLING],
        CANCEL: [GAMBLING],
        REOPEN: [],
      },
    });
  });

  it.each(NO_GRANT)('%s gets no mirror at all', (role) => {
    expect(statusGrantMirror(roleContext(role))).toBeNull();
  });

  it('a user with no assignments gets no mirror', () => {
    expect(statusGrantMirror(contextFor([]))).toBeNull();
  });
});

describe('rowStatusActions is the client twin of permittedStatusActions [STORY-VAC-02-1]', () => {
  const rows = (
    status: VacancyStatus,
    verticalId: typeof GAMBLING | typeof CRYPTO,
    leader: typeof ME | typeof OTHER | null,
  ) => ({
    row: {
      status,
      vertical: { id: verticalId, name: 'x' },
      teamLead: leader && { id: leader, fullName: 'x', isActive: true },
    },
    facts: { status, verticalId, teamLeadId: leader },
  });
  const viewers = [
    ...ROLE_COLUMNS.flatMap((role) => [
      [role, roleContext(role)] as const,
      ...(role === 'ADMIN'
        ? ([[`${role} aal1`, roleContext(role, 'aal1')]] as const)
        : []),
    ]),
    [
      'Team Lead here, Head Recruiter there',
      contextFor([
        { role: 'TEAM_LEAD', verticalId: GAMBLING },
        { role: 'HEAD_RECRUITER', verticalId: CRYPTO },
      ]),
    ] as const,
  ];

  it.each(viewers)(
    '%s sees the same items as the card would',
    (_name, auth) => {
      const mirror = statusGrantMirror(auth);
      for (const status of STATUSES)
        for (const verticalId of [GAMBLING, CRYPTO])
          for (const leader of [ME, OTHER, null] as const) {
            const { row, facts } = rows(status, verticalId, leader);
            expect(rowStatusActions(row, mirror)).toEqual(
              permittedStatusActions(auth, facts),
            );
          }
    },
  );

  it('no mirror means no items', () => {
    expect(rowStatusActions(rows('OPEN', GAMBLING, ME).row, null)).toEqual([]);
  });
});
