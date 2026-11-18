import { assignVacancyRecruitersSchema } from '@/lib/schemas/vacancy-assignment';
import {
  vacancyDetailSchema,
  vacancyIdParamsSchema,
} from '@/lib/schemas/vacancy';
import { defineRoute } from '@/server/http/route';
import { assignVacancyRecruiters } from '@/server/services/vacancy-assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute(
  {
    method: 'POST',
    path: '/vacancies/{vacancyId}/recruiters',
    operationId: 'assignVacancyRecruiters',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.assign_recruiters',
    summary:
      'Adds recruiters to an `OPEN` or `ON_HOLD` vacancy at the `expectedVersion` the caller last saw (Admin with aal2, Head Recruiter of the vertical). 403 without the grant, 404 for an unreadable vacancy, 409 `VACANCY_CLOSED` for any other status, 409 `STALE_STATE` on a stale version, one 400 `invalid_recruiter` on `body.recruiterIds` (same for every reason, no id echoed; the validation status the vacancy form uses for `invalid_team_lead`) when a new id is not an active, invited RECRUITER of the vertical; ids already assigned are skipped and an all-skipped request answers 200 without a write',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    body: assignVacancyRecruitersSchema,
    response: vacancyDetailSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body }) =>
    assignVacancyRecruiters(ctx, params.vacancyId, body),
);
