import { describe, expect, it } from 'vitest';
import type { BuiltinRole } from '@/server/authz/types';
import {
  canChangeUrgency,
  hasBroadUpdate,
} from '@/server/authz/vacancy-urgency';
import {
  contextFor,
  CRYPTO,
  GAMBLING,
  ROLE_COLUMNS,
  roleContext,
} from './fixtures';

const BROAD: readonly BuiltinRole[] = ['ADMIN', 'HEAD_RECRUITER'];

describe('urgency authority [STORY-VAC-08-2, D94]', () => {
  it.each(ROLE_COLUMNS)(
    '%s: broad update only for Admin and Head Recruiter',
    (role) => {
      expect(hasBroadUpdate(roleContext(role), GAMBLING)).toBe(
        BROAD.includes(role),
      );
    },
  );

  it('Admin without aal2 holds no global grant', () => {
    expect(hasBroadUpdate(roleContext('ADMIN', 'aal1'), GAMBLING)).toBe(false);
  });

  it('Head Recruiter is limited to the own vertical', () => {
    const auth = roleContext('HEAD_RECRUITER');
    expect(hasBroadUpdate(auth, GAMBLING)).toBe(true);
    expect(hasBroadUpdate(auth, CRYPTO)).toBe(false);
  });

  it('the Team Lead own grant never counts, on a vacancy of any vertical', () => {
    const auth = roleContext('TEAM_LEAD');
    expect(hasBroadUpdate(auth, GAMBLING)).toBe(false);
    expect(hasBroadUpdate(auth, CRYPTO)).toBe(false);
  });

  it('mixed roles decide per vertical', () => {
    const auth = contextFor([
      { role: 'TEAM_LEAD', verticalId: GAMBLING },
      { role: 'HEAD_RECRUITER', verticalId: CRYPTO },
    ]);
    expect(hasBroadUpdate(auth, GAMBLING)).toBe(false);
    expect(hasBroadUpdate(auth, CRYPTO)).toBe(true);
  });

  it('a Team Lead who also heads recruiting in the vertical may change it', () => {
    const auth = contextFor([
      { role: 'TEAM_LEAD', verticalId: GAMBLING },
      { role: 'HEAD_RECRUITER', verticalId: GAMBLING },
    ]);
    expect(hasBroadUpdate(auth, GAMBLING)).toBe(true);
  });

  it.each([
    ['DRAFT', false],
    ['OPEN', true],
    ['ON_HOLD', true],
    ['FILLED', false],
    ['CANCELLED', false],
  ] as const)('Head Recruiter on %s: %s', (status, expected) => {
    expect(
      canChangeUrgency(roleContext('HEAD_RECRUITER'), {
        verticalId: GAMBLING,
        status,
      }),
    ).toBe(expected);
  });

  it('is false for a Team Lead on an OPEN vacancy', () => {
    expect(
      canChangeUrgency(roleContext('TEAM_LEAD'), {
        verticalId: GAMBLING,
        status: 'OPEN',
      }),
    ).toBe(false);
  });
});
