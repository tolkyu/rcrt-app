import { describe, expect, it } from 'vitest';
import { setVacancyTeamLeadSchema } from '../../../lib/schemas/vacancy-team-lead';

const id = '5d1f3c1e-8b6b-4a54-9f0d-2f7c2d2b0b05';

describe('setVacancyTeamLeadSchema [VAC-03, S4-1]', () => {
  it('lowercases an upper-case Team Lead id so a repeat is the same user', () => {
    expect(
      setVacancyTeamLeadSchema.parse({
        teamLeadId: id.toUpperCase(),
        expectedVersion: 3,
      }),
    ).toEqual({ teamLeadId: id, expectedVersion: 3 });
  });

  it('refuses extra keys and a missing Team Lead', () => {
    expect(
      setVacancyTeamLeadSchema.safeParse({
        teamLeadId: id,
        expectedVersion: 3,
        status: 'OPEN',
      }).success,
    ).toBe(false);
    expect(
      setVacancyTeamLeadSchema.safeParse({ expectedVersion: 3 }).success,
    ).toBe(false);
  });
});
