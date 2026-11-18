import { describe, expect, it } from 'vitest';
import {
  VACANCY_STATUS_ACTIONS,
  type VacancyStatusAction,
} from '@/server/domain/vacancy-status/transitions';
import type { BuiltinRole, VacancyStatus } from '@/server/authz/types';
import {
  mayRequestStatusAction,
  permittedStatusActions,
} from '@/server/authz/vacancy-status';
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
