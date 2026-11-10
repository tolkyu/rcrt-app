import {
  cancelVacancySchema,
  vacancyDetailSchema,
  vacancyIdParamsSchema,
} from '@/lib/schemas/vacancy';
import { authorsAnywhere } from '@/server/authz/vacancy-author';
import { defineRoute } from '@/server/http/route';
import { cancelVacancyDraft } from '@/server/services/vacancy-draft';

export const dynamic = 'force-dynamic';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/vacancies/{vacancyId}/cancel',
    operationId: 'cancelVacancyDraft',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.create',
    hideUnless: authorsAnywhere,
    summary:
      'Cancel the author’s own DRAFT (`DRAFT → CANCELLED`, D82) with a reason; the cancelled draft stays private to its author. Another user’s draft, or any caller without an authoring role, gets 404; a vacancy that is not a draft is 409 `VACANCY_NOT_DRAFT`; no audit row (D92)',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    body: cancelVacancySchema,
    response: vacancyDetailSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body }) => cancelVacancyDraft(ctx, params.vacancyId, body),
);
