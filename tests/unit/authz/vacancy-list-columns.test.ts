import { describe, expect, it } from 'vitest';
import { seesOnlyOwnLedVacancies } from '@/server/authz/vacancy-scope';
import { contextFor, CRYPTO, GAMBLING, roleContext } from './fixtures';

describe('«Тімлід» column of the vacancy list [VAC-04, screens S-04]', () => {
  it('a Team Lead reads only the vacancies they lead, so every row would name them', () => {
    expect(seesOnlyOwnLedVacancies(roleContext('TEAM_LEAD'))).toBe(true);
    expect(
      seesOnlyOwnLedVacancies(
        contextFor([
          { role: 'TEAM_LEAD', verticalId: GAMBLING },
          { role: 'TEAM_LEAD', verticalId: CRYPTO },
        ]),
      ),
    ).toBe(true);
  });

  it.each([
    'ADMIN',
    'HEAD_RECRUITER',
    'RECRUITER',
    'HEAD_HR',
    'HR',
    'FINANCE',
  ] as const)('%s sees other leads, so keeps the column', (role) => {
    expect(seesOnlyOwnLedVacancies(roleContext(role))).toBe(false);
  });

  it('a Team Lead who also reads another scope keeps the column', () => {
    expect(
      seesOnlyOwnLedVacancies(
        contextFor([
          { role: 'TEAM_LEAD', verticalId: GAMBLING },
          { role: 'RECRUITER', verticalId: CRYPTO },
        ]),
      ),
    ).toBe(false);
  });
});
