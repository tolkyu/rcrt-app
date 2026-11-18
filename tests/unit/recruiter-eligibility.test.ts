import { describe, expect, it } from 'vitest';
import { isEligibleRecruiterRow } from '@/server/repositories/recruiter-eligibility';

const accepted = new Date('2026-11-01T00:00:00Z');

describe('recruiter eligibility [D130-1]', () => {
  it.each([
    ['active, accepted, RECRUITER', true, accepted, 'RECRUITER', true],
    ['inactive', false, accepted, 'RECRUITER', false],
    ['invite not accepted', true, null, 'RECRUITER', false],
    ['Team Lead role', true, accepted, 'TEAM_LEAD', false],
    ['Head Recruiter role', true, accepted, 'HEAD_RECRUITER', false],
    ['custom role', true, accepted, 'custom:recruiter_like', false],
  ] as const)('%s', (_name, isActive, activatedAt, role, expected) => {
    expect(isEligibleRecruiterRow({ isActive, activatedAt }, { role })).toBe(
      expected,
    );
  });
});
