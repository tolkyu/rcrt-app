import {
  setVacancyUrgencySchema,
  vacancyDetailSchema,
  vacancyIdParamsSchema,
} from '@/lib/schemas/vacancy';
import { defineRoute } from '@/server/http/route';
import { setVacancyUrgency } from '@/server/services/vacancy-urgency';

export const dynamic = 'force-dynamic';
export const PUT = defineRoute(
  {
    method: 'PUT',
    path: '/vacancies/{vacancyId}/urgency',
    operationId: 'setVacancyUrgency',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.update',
    summary:
      'Set the vacancy urgency flag (`NORMAL` or `URGENT`; not the Team Lead priority) at the `expectedVersion` the caller last saw. Needs a vacancy-wide `vacancy.update` grant (Head Recruiter of the vertical, Admin with aal2): a caller without any `vacancy.update` grant gets 403, a Team Lead gets 403 even on own vacancies (404 outside their scope), and an unreadable vacancy (another vertical, someone else’s draft) is 404. 409 `VACANCY_URGENCY_LOCKED` unless the vacancy is `OPEN` or `ON_HOLD`; 409 `STALE_STATE` on a stale version; the value already stored writes nothing and answers 200',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    body: setVacancyUrgencySchema,
    response: vacancyDetailSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body }) => setVacancyUrgency(ctx, params.vacancyId, body),
);
