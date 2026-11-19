import { vacancyIdParamsSchema } from '@/lib/schemas/vacancy';
import {
  updateVacancyContentSchema,
  vacancyContentSchema,
} from '@/lib/schemas/vacancy-content';
import { defineRoute } from '@/server/http/route';
import { updateVacancyContent } from '@/server/services/vacancy-content';

export const dynamic = 'force-dynamic';
export const PATCH = defineRoute(
  {
    method: 'PATCH',
    path: '/vacancies/{vacancyId}/content',
    operationId: 'updateVacancyContent',
    permission: 'vacancy.read',
    summary:
      'Replace or clear description/requirements on OPEN or ON_HOLD vacancies. Requires vacancy.update or vacancy.content.update on the locked resource; visible action denial is 403 and unreadable/private drafts are 404. Authorized DRAFT/FILLED/CANCELLED requests answer 409 VACANCY_CONTENT_LOCKED. expectedVersion is checked before no-op (409 STALE_STATE). A current no-op writes no history. Draft PATCH is unchanged.',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    body: updateVacancyContentSchema,
    response: vacancyContentSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body }) => updateVacancyContent(ctx, params.vacancyId, body),
);
