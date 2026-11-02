import { describe, expect, it } from 'vitest';
import { diffRoleAssignments, roleAssignmentKey } from '../../lib/role-diff';

const GAMBLING = '11111111-1111-4111-8111-111111111111';
const CRYPTO = '22222222-2222-4222-8222-222222222222';
const recruiter = { role: 'RECRUITER', verticalId: GAMBLING };
const teamLead = { role: 'TEAM_LEAD', verticalId: CRYPTO };
const admin = { role: 'ADMIN', verticalId: null };

describe('diffRoleAssignments [STORY-ROLE-01-1/01-2]', () => {
  it('returns nothing for the same set in any order', () => {
    expect(
      diffRoleAssignments([recruiter, admin], [admin, { ...recruiter }]),
    ).toEqual({ added: [], removed: [] });
  });

  it('splits a replacement into additions and removals', () => {
    expect(
      diffRoleAssignments(
        [recruiter, teamLead],
        [recruiter, admin, { role: 'TEAM_LEAD', verticalId: GAMBLING }],
      ),
    ).toEqual({
      added: [admin, { role: 'TEAM_LEAD', verticalId: GAMBLING }],
      removed: [teamLead],
    });
  });

  it('treats the same role in another vertical as a different assignment (D35)', () => {
    const crypto = { role: 'RECRUITER', verticalId: CRYPTO };
    expect(diffRoleAssignments([recruiter], [crypto])).toEqual({
      added: [crypto],
      removed: [recruiter],
    });
  });

  it('removes everything for an empty set and adds everything to an empty user', () => {
    expect(diffRoleAssignments([recruiter, admin], [])).toEqual({
      added: [],
      removed: [recruiter, admin],
    });
    expect(diffRoleAssignments([], [teamLead])).toEqual({
      added: [teamLead],
      removed: [],
    });
  });

  it('adds a repeated assignment once', () => {
    expect(diffRoleAssignments([], [admin, { ...admin }]).added).toEqual([
      admin,
    ]);
  });

  it('keeps global and vertical keys apart', () => {
    expect(roleAssignmentKey(admin)).toBe('ADMIN|');
    expect(roleAssignmentKey(recruiter)).toBe(`RECRUITER|${GAMBLING}`);
  });
});
