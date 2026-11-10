import {
  publishDraftSchema,
  vacancyDetailSchema,
  vacancyIdParamsSchema,
} from '@/lib/schemas/vacancy';
import { authorsAnywhere } from '@/server/authz/vacancy-author';
import { defineRoute } from '@/server/http/route';
import { publishVacancyDraft } from '@/server/services/vacancy-draft';

export const dynamic = 'force-dynamic';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/vacancies/{vacancyId}/publish',
    operationId: 'publishVacancyDraft',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.create',
    hideUnless: authorsAnywhere,
    idempotent: true,
    summary:
      'Publish the author’s own DRAFT (`DRAFT → OPEN`, opening date = now) at the `expectedVersion` the author last saw, after re-validating every rule of a published creation. Another user’s draft, or any caller without an authoring role, gets 404; 400 `body.positionId required` / `invalid_team_lead`; 409 `VACANCY_NOT_DRAFT` (already published, cancelled), `POSITION_INACTIVE`, `STALE_STATE` or `IDEMPOTENCY_KEY_REUSED`; a replay with the same key and version returns the same vacancy',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    body: publishDraftSchema,
    response: vacancyDetailSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body, idempotencyKey }) =>
    publishVacancyDraft(ctx, params.vacancyId, idempotencyKey, body),
);
