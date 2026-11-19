import { z } from 'zod';
import { uuid } from './uuid';
import { expectedVersion, vacancyIdParamsSchema } from './vacancy';

export const VACANCY_ASSIGN_MAX = 20;

export const claimVacancySchema = z.object({}).strict().meta({
  id: 'ClaimVacancy',
  description:
    'Empty body. A Recruiter takes an `OPEN` vacancy nobody works on yet; the first claim wins and the second answers 409 VACANCY_ALREADY_ASSIGNED.',
});

export const assignVacancyRecruitersSchema = z
  .object({
    recruiterIds: z
      .array(uuid)
      .min(1)
      .max(VACANCY_ASSIGN_MAX)
      .refine((ids) => new Set(ids).size === ids.length, 'duplicate_ids'),
    expectedVersion,
  })
  .strict()
  .meta({
    id: 'AssignVacancyRecruiters',
    description:
      'Adds 1 to 20 distinct recruiters (active, invite accepted, RECRUITER role in the vacancy vertical) to an `OPEN` or `ON_HOLD` vacancy; ids already assigned are skipped and a request that adds nobody writes nothing.',
  });
export type AssignVacancyRecruitersInput = z.input<
  typeof assignVacancyRecruitersSchema
>;

export const vacancyRecruiterParamsSchema = vacancyIdParamsSchema.extend({
  userId: z.string().max(64).meta({ description: 'Recruiter user id (uuid).' }),
});

export const unassignVacancyRecruiterQuerySchema = z
  .object({ expectedVersion: z.coerce.number().pipe(expectedVersion) })
  .strict()
  .meta({ id: 'UnassignVacancyRecruiterQuery' });
export type UnassignVacancyRecruiterQuery = z.input<
  typeof unassignVacancyRecruiterQuerySchema
>;

export const assignableRecruitersSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.uuid(),
        fullName: z.string(),
        assigned: z.boolean(),
        active: z.boolean(),
      }),
    ),
  })
  .meta({ id: 'AssignableRecruiters' });
export type AssignableRecruiters = z.infer<typeof assignableRecruitersSchema>;
