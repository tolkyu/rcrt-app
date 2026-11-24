import { vacancyIdParamsSchema } from '@/lib/schemas/vacancy';
import {
  updateVacancyContentSchema,
  vacancyContentSchema,
  vacancyContentReadSchema,
} from '@/lib/schemas/vacancy-content';
import { defineRoute } from '@/server/http/route';
import {
  getVacancyContent,
  updateVacancyContent,
} from '@/server/services/vacancy-content';

export const dynamic = 'force-dynamic';
export const GET = defineRoute(
  {
    method: 'GET',
    path: '/vacancies/{vacancyId}/content',
    operationId: 'getVacancyContent',
    permission: 'vacancy.read',
    summary:
      'Read canonical vacancy documents, revision and advisory content-edit eligibility from one scoped snapshot. Existing vacancy visibility includes read-only and visible closed rows; private drafts remain author-only. This read consumes no vacancy write limit or history. PATCH rechecks authorization independently.',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    response: vacancyContentReadSchema,
    errors: [404],
  },
  (ctx, { params }) => getVacancyContent(ctx, params.vacancyId),
);
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
