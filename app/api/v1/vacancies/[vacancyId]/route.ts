import {
  patchVacancySchema,
  vacancyDeletedSchema,
  vacancyDetailSchema,
  vacancyIdParamsSchema,
} from '@/lib/schemas/vacancy';
import { authorsAnywhere } from '@/server/authz/vacancy-author';
import { defineRoute } from '@/server/http/route';
import { getVacancyDetail } from '@/server/services/vacancy';
import {
  deleteVacancyDraft,
  patchVacancyDraft,
} from '@/server/services/vacancy-draft';

export const dynamic = 'force-dynamic';
export const GET = defineRoute(
  {
    method: 'GET',
    path: '/vacancies/{vacancyId}',
    operationId: 'getVacancy',
    permission: 'vacancy.read',
    summary: 'Read a visible vacancy overview',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    response: vacancyDetailSchema,
    errors: [404],
  },
  (ctx, { params }) => getVacancyDetail(ctx, params.vacancyId),
);

export const PATCH = defineRoute(
  {
    method: 'PATCH',
    path: '/vacancies/{vacancyId}',
    operationId: 'updateVacancyDraft',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.create',
    hideUnless: authorsAnywhere,
    summary:
      'Edit the author’s own DRAFT (partial update with `expectedVersion`). Another user’s draft, or any caller without an authoring role, gets 404; a vacancy that is not a draft is 409 `VACANCY_NOT_DRAFT` (403 only for a caller who authors in another vertical); 409 `STALE_STATE` or `POSITION_INACTIVE`; 429 after 30 writes per user per minute',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    body: patchVacancySchema,
    response: vacancyDetailSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body }) => patchVacancyDraft(ctx, params.vacancyId, body),
);

export const DELETE = defineRoute(
  {
    method: 'DELETE',
    path: '/vacancies/{vacancyId}',
    operationId: 'deleteVacancyDraft',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.create',
    hideUnless: authorsAnywhere,
    summary:
      'Soft-delete the author’s own DRAFT; afterwards it is 404 for everyone and its number is never reused. Another user’s draft, or any caller without an authoring role, gets 404; a vacancy that is not a draft is 409 `VACANCY_NOT_DRAFT`; no audit row (D92)',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    response: vacancyDeletedSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params }) => deleteVacancyDraft(ctx, params.vacancyId),
);
