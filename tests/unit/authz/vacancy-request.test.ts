import { describe, expect, it } from 'vitest';
import {
  canRequestVacancy,
  requestsAnywhere,
  vacancyRequestVerticals,
} from '@/server/authz/vacancy-request';
import {
  CRYPTO,
  GAMBLING,
  ROLE_COLUMNS,
  contextFor,
  roleContext,
} from './fixtures';

describe('request path identification [STORY-VAC-03-3, D87]', () => {
  it.each(ROLE_COLUMNS)(
    '%s yields request verticals only as TEAM_LEAD',
    (role) => {
      const auth = roleContext(role);
      expect(requestsAnywhere(auth)).toBe(role === 'TEAM_LEAD');
      expect([...vacancyRequestVerticals(auth)]).toEqual(
        role === 'TEAM_LEAD' ? [GAMBLING] : [],
      );
    },
  );

  it('is limited to the verticals where the Team Lead role is held, also beside other roles', () => {
    const auth = contextFor([
      { role: 'TEAM_LEAD', verticalId: GAMBLING },
      { role: 'RECRUITER', verticalId: CRYPTO },
    ]);
    expect(canRequestVacancy(auth, GAMBLING)).toBe(true);
    expect(canRequestVacancy(auth, CRYPTO)).toBe(false);
  });

  it('a user without roles requests nowhere', () => {
    expect(requestsAnywhere(contextFor([]))).toBe(false);
  });
});
