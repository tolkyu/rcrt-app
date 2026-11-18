import {
  unassignVacancyRecruiterQuerySchema,
  vacancyRecruiterParamsSchema,
} from '@/lib/schemas/vacancy-assignment';
import { vacancyDetailSchema } from '@/lib/schemas/vacancy';
import { defineRoute } from '@/server/http/route';
import { unassignVacancyRecruiter } from '@/server/services/vacancy-assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = defineRoute(
  {
    method: 'DELETE',
    path: '/vacancies/{vacancyId}/recruiters/{userId}',
    operationId: 'unassignVacancyRecruiter',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.assign_recruiters',
    summary:
      'Removes a recruiter from an `OPEN` or `ON_HOLD` vacancy at the `expectedVersion` (query) the caller last saw (Admin with aal2, Head Recruiter of the vertical; a Recruiter cannot remove anyone, self included: 403). Any well-formed user id outside the recruiter set, existing or not, answers the same 200 without a write; a malformed id is 404. 409 `VACANCY_CLOSED` / `STALE_STATE`',
    tags: ['Vacancies'],
    params: vacancyRecruiterParamsSchema,
    query: unassignVacancyRecruiterQuerySchema,
    response: vacancyDetailSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, query }) =>
    unassignVacancyRecruiter(ctx, params.vacancyId, params.userId, query),
);
