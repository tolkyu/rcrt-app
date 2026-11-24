import { z } from 'zod';
import { VACANCY_PRIORITIES } from '../vacancy-filters';
import {
  VACANCY_HEADCOUNT_MAX,
  VACANCY_REQUEST_COMMENT_MAX,
  VACANCY_REQUEST_COMMENT_MAX_LINES,
} from '../vacancy-limits';
import { multilineText } from './reason';
import { uuid } from './uuid';

export const requestVacancySchema = z
  .object({
    positionId: uuid,
    headcount: z.number().int().min(1).max(VACANCY_HEADCOUNT_MAX).default(1),
    priority: z.enum(VACANCY_PRIORITIES).default('NORMAL'),
    comment: multilineText(VACANCY_REQUEST_COMMENT_MAX)
      .refine(
        (value) =>
          value.split(/\n/).length <= VACANCY_REQUEST_COMMENT_MAX_LINES,
        'too_many_lines',
      )
      .optional(),
  })
  .strict()
  .meta({ id: 'RequestVacancy' });

export type RequestVacancyInput = z.input<typeof requestVacancySchema>;
