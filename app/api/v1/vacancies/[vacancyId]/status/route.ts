import {
  vacancyDetailSchema,
  vacancyIdParamsSchema,
} from '@/lib/schemas/vacancy';
import { changeVacancyStatusSchema } from '@/lib/schemas/vacancy-status';
import { defineRoute } from '@/server/http/route';
import { changeVacancyStatus } from '@/server/services/vacancy-status';

export const dynamic = 'force-dynamic';
export const PUT = defineRoute(
  {
    method: 'PUT',
    path: '/vacancies/{vacancyId}/status',
    operationId: 'changeVacancyStatus',
    permission: 'vacancy.read',
    summary:
      'Pause, resume, cancel (with a reason) or reopen a published vacancy at the `expectedVersion` the caller last saw. Admin and Head Recruiter of the vertical may do all four; a Team Lead may pause, resume and cancel only the vacancy where they are the Team Lead and never reopen. A caller with none of these grants gets 403, an unreadable vacancy (another vertical, someone else’s draft, another Team Lead’s vacancy) is 404. 409 `VACANCY_STATUS_INVALID` when the action is not legal from the stored status (a cancelled vacancy never reopens, nothing sets FILLED by hand, a DRAFT has no status action); 409 `STALE_STATE` on a stale version. Repeating pause on a paused vacancy, resume or reopen on an open one writes nothing and answers 200. The cancel reason is returned as `cancelReason` and is readable on the detail by everyone who reads the vacancy',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    body: changeVacancyStatusSchema,
    response: vacancyDetailSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body }) => changeVacancyStatus(ctx, params.vacancyId, body),
);
