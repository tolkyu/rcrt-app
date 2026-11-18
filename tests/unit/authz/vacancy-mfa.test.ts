import { describe, expect, it } from 'vitest';
import { can, requirePermission } from '@/server/authz/can';
import { UnauthenticatedError } from '@/server/http/errors';
import { mayRequestStatusAction } from '@/server/authz/vacancy-status';
import { needsMfa } from '@/server/authz/vacancy-mfa';
import type { UserId } from '@/server/authz/types';
import { contextFor, CRYPTO, GAMBLING, OTHER, roleContext } from './fixtures';

const ADMIN = { role: 'ADMIN', verticalId: null } as const;
const recruiter = { role: 'RECRUITER', verticalId: GAMBLING } as const;
const head = { role: 'HEAD_RECRUITER', verticalId: GAMBLING } as const;
const lead = { role: 'TEAM_LEAD', verticalId: GAMBLING } as const;
const open = { verticalId: GAMBLING, status: 'OPEN', teamLead: null } as const;

describe('needsMfa [D63, STORY-VAC-02-1, VAC-03-1, VAC-03-2]', () => {
  it('an Admin who is also a Recruiter lacks the Admin controls at aal1', () => {
    expect(needsMfa(contextFor([ADMIN, recruiter], 'aal1'), open)).toBe(true);
  });

  it('is false once the session is aal2', () => {
    expect(needsMfa(contextFor([ADMIN, recruiter], 'aal2'), open)).toBe(false);
  });

  it.each([
    'RECRUITER',
    'HEAD_RECRUITER',
    'TEAM_LEAD',
    'HR',
    'FINANCE',
  ] as const)('a non-Admin %s never gets the flag', (role) => {
    expect(needsMfa(roleContext(role, 'aal1'), open)).toBe(false);
  });

  it('a Head Recruiter of the vertical already holds everything the Admin grant would add', () => {
    expect(needsMfa(contextFor([ADMIN, head], 'aal1'), open)).toBe(false);
  });

  it('the Admin grant is global, so a Head Recruiter elsewhere still has something to unlock', () => {
    const elsewhere = { role: 'HEAD_RECRUITER', verticalId: CRYPTO } as const;
    expect(needsMfa(contextFor([ADMIN, elsewhere], 'aal1'), open)).toBe(true);
  });

  it('a Team Lead of the vacancy lacks only the team controls, which Admin would add', () => {
    const ctx = contextFor([ADMIN, lead], 'aal1');
    expect(needsMfa(ctx, { ...open, teamLead: { id: ctx.userId } })).toBe(true);
  });

  it.each(['DRAFT', 'CANCELLED'] as const)(
    'a %s vacancy has no team or status control to unlock',
    (status) => {
      expect(
        needsMfa(contextFor([ADMIN, recruiter], 'aal1'), { ...open, status }),
      ).toBe(false);
    },
  );

  it('FILLED offers REOPEN, which only the Admin grant would add for a Recruiter', () => {
    expect(
      needsMfa(contextFor([ADMIN, recruiter], 'aal1'), {
        ...open,
        status: 'FILLED',
      }),
    ).toBe(true);
  });

  it('an assigned Team Lead who is someone else leaves the Team Lead control closed but the rest unlockable', () => {
    expect(
      needsMfa(contextFor([ADMIN, recruiter], 'aal1'), {
        ...open,
        teamLead: { id: OTHER },
      }),
    ).toBe(true);
  });

  describe('withheld grants only describe, they never authorise [SEC-CORE-09]', () => {
    const ref = {
      type: 'vacancy',
      id: 'vacancy-1',
      verticalId: GAMBLING,
      status: 'OPEN',
      teamLeadId: null,
      createdBy: OTHER as UserId,
      neverOpened: false,
      recruiterInitiated: false,
      assignedRecruiterIds: [],
      maxApplicationStage: null,
    } as const;

    it('records the Admin grants without putting them in the live grants', () => {
      const ctx = contextFor([ADMIN, recruiter], 'aal1');
      expect(ctx.mfaWithheldGrants.has('vacancy.assign_recruiters')).toBe(true);
      expect(ctx.grants.has('vacancy.assign_recruiters')).toBe(false);
    });

    it('refuses the Admin-only actions at aal1 and allows them at aal2', () => {
      const aal1 = contextFor([ADMIN, recruiter], 'aal1');
      expect(() =>
        requirePermission(aal1, 'vacancy.assign_recruiters'),
      ).toThrow(UnauthenticatedError);
      for (const permission of [
        'vacancy.assign_recruiters',
        'vacancy.team_lead.set',
        'vacancy.hold',
      ] as const)
        expect(can(aal1, permission, ref), permission).toBe(false);
      expect(mayRequestStatusAction(aal1, { ...ref }, 'HOLD')).toBe(false);

      const aal2 = contextFor([ADMIN, recruiter], 'aal2');
      expect(can(aal2, 'vacancy.assign_recruiters', ref)).toBe(true);
      expect(mayRequestStatusAction(aal2, { ...ref }, 'HOLD')).toBe(true);
    });
  });
});
