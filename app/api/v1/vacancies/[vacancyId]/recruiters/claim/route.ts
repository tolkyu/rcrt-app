import { claimVacancySchema } from '@/lib/schemas/vacancy-assignment';
import {
  vacancyDetailSchema,
  vacancyIdParamsSchema,
} from '@/lib/schemas/vacancy';
import { defineRoute } from '@/server/http/route';
import { claimVacancy } from '@/server/services/vacancy-assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    method: 'POST',
    path: '/vacancies/{vacancyId}/recruiters/claim',
    operationId: 'claimVacancy',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.self_assign',
    summary:
      'A Recruiter takes an `OPEN` vacancy nobody works on yet (first claim wins). 403 without `vacancy.self_assign` or the RECRUITER role of the vertical, 404 for a vacancy outside the caller’s scope (assigned to others, paused, closed, another vertical, a draft), 409 `VACANCY_ALREADY_ASSIGNED` only when another claim committed first; a caller already assigned gets 200 and nothing is written',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    body: claimVacancySchema,
    response: vacancyDetailSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body }) => claimVacancy(ctx, params.vacancyId, body),
);
