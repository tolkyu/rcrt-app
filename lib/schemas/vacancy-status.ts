import { z } from 'zod';
import { VACANCY_HEADCOUNT_MAX } from '../vacancy-limits';
import { VACANCY_REASON_MAX } from '../reason-length';
import { multilineReason } from './reason';
import { expectedVersion } from './vacancy';

const toggle = (action: 'HOLD' | 'RESUME') =>
  z.object({ action: z.literal(action), expectedVersion }).strict();

/** One body per action, each strict: `reason` exists only on CANCEL and `headcount` only on REOPEN (ADR-017). */
export const changeVacancyStatusSchema = z
  .discriminatedUnion('action', [
    toggle('HOLD'),
    toggle('RESUME'),
    z
      .object({
        action: z.literal('CANCEL'),
        reason: multilineReason(VACANCY_REASON_MAX),
        expectedVersion,
      })
      .strict(),
    z
      .object({
        action: z.literal('REOPEN'),
        headcount: z
          .number()
          .int()
          .min(1)
          .max(VACANCY_HEADCOUNT_MAX)
          .optional(),
        expectedVersion,
      })
      .strict(),
  ])
  .meta({
    id: 'ChangeVacancyStatus',
    description:
      'HOLD (OPEN to ON_HOLD), RESUME (ON_HOLD to OPEN), CANCEL (OPEN or ON_HOLD to CANCELLED, with a required reason kept only in the purgeable side row) and REOPEN (FILLED to OPEN, optional new headcount). There is no action that fills or reopens a cancelled vacancy; unknown keys answer 400.',
  });
export type ChangeVacancyStatusInput = z.input<
  typeof changeVacancyStatusSchema
>;
