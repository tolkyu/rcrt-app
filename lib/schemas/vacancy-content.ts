import { z } from 'zod';
import { VACANCY_STATUSES } from '../vacancy-filters';
import { richTextDocSchema } from './rich-text';
import { expectedVersion } from './vacancy';

export const updateVacancyContentSchema = z
  .object({
    expectedVersion,
    descriptionDoc: richTextDocSchema.nullable().optional(),
    requirementsDoc: richTextDocSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.descriptionDoc === undefined &&
      value.requirementsDoc === undefined
    )
      ctx.addIssue({ code: 'custom', path: [], message: 'empty_patch' });
  })
  .meta({
    id: 'UpdateVacancyContent',
    description:
      'OPEN/ON_HOLD content only: omission keeps, null clears, a document replaces. Unknown keys are rejected. expectedVersion must match even for a no-op.',
  });
export type UpdateVacancyContentInput = z.input<
  typeof updateVacancyContentSchema
>;

export const vacancyContentSchema = z
  .object({
    id: z.uuid(),
    version: expectedVersion,
    updatedAt: z.iso.datetime(),
    descriptionDoc: richTextDocSchema.nullable(),
    requirementsDoc: richTextDocSchema.nullable(),
  })
  .strict()
  .meta({ id: 'VacancyContent' });
export type VacancyContent = z.output<typeof vacancyContentSchema>;

export const vacancyContentReadSchema = vacancyContentSchema
  .extend({
    status: z.enum(VACANCY_STATUSES),
    canEditContent: z.boolean(),
  })
  .meta({ id: 'VacancyContentRead' });
export type VacancyContentRead = z.output<typeof vacancyContentReadSchema>;
