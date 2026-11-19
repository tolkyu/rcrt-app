import { z } from 'zod';
import { VACANCY_REASON_MAX } from '../reason-length';
import { multilineReason } from './reason';

/** Apart from `vacancy.ts`: only the cancel route and service parse it, so the form bundles do not carry it. */
export const cancelVacancySchema = z
  .object({ reason: multilineReason(VACANCY_REASON_MAX) })
  .strict()
  .meta({
    id: 'CancelVacancy',
    description:
      'Why the author closes the draft (D82). Kept only in the purgeable side row of the event, never in the audit log.',
  });
export type CancelVacancyInput = z.input<typeof cancelVacancySchema>;
