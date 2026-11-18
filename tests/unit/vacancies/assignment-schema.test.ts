import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assignVacancyRecruitersSchema,
  claimVacancySchema,
  unassignVacancyRecruiterQuerySchema,
} from '../../../lib/schemas/vacancy-assignment';

const id = randomUUID();

describe('assignment request schemas [STORY-VAC-03-1, VAC-03-2]', () => {
  it('claim takes an empty body only', () => {
    expect(claimVacancySchema.safeParse({}).success).toBe(true);
    expect(claimVacancySchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('assign lower-cases ids and accepts 1 to 20 distinct ones', () => {
    const parsed = assignVacancyRecruitersSchema.parse({
      recruiterIds: [id.toUpperCase()],
      expectedVersion: 3,
    });
    expect(parsed.recruiterIds).toEqual([id]);
    const twenty = Array.from({ length: 20 }, () => randomUUID());
    expect(
      assignVacancyRecruitersSchema.safeParse({
        recruiterIds: twenty,
        expectedVersion: 1,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['no ids', { recruiterIds: [], expectedVersion: 1 }],
    [
      '21 ids',
      {
        recruiterIds: Array.from({ length: 21 }, () => randomUUID()),
        expectedVersion: 1,
      },
    ],
    [
      'duplicates in another case',
      { recruiterIds: [id, id.toUpperCase()], expectedVersion: 1 },
    ],
    ['an extra key', { recruiterIds: [id], expectedVersion: 1, by: id }],
    ['a zero version', { recruiterIds: [id], expectedVersion: 0 }],
    ['a missing version', { recruiterIds: [id] }],
  ])('assign rejects %s', (_name, body) => {
    expect(assignVacancyRecruitersSchema.safeParse(body).success).toBe(false);
  });

  it('remove reads the version from the query string and rejects anything else', () => {
    expect(
      unassignVacancyRecruiterQuerySchema.parse({ expectedVersion: '4' }),
    ).toEqual({ expectedVersion: 4 });
    for (const bad of ['', 'abc', '1.5', '0', ['1', '2']])
      expect(
        unassignVacancyRecruiterQuerySchema.safeParse({ expectedVersion: bad })
          .success,
      ).toBe(false);
    expect(
      unassignVacancyRecruiterQuerySchema.safeParse({
        expectedVersion: '1',
        x: '1',
      }).success,
    ).toBe(false);
  });
});
