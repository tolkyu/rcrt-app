import {
  vacancyDetailSchema,
  vacancyIdParamsSchema,
} from '@/lib/schemas/vacancy';
import { setVacancyTeamLeadSchema } from '@/lib/schemas/vacancy-team-lead';
import { defineRoute } from '@/server/http/route';
import { setVacancyTeamLead } from '@/server/services/vacancy-team-lead-set';

export const dynamic = 'force-dynamic';
export const PUT = defineRoute(
  {
    method: 'PUT',
    path: '/vacancies/{vacancyId}/team-lead',
    operationId: 'setVacancyTeamLead',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.team_lead.set',
    summary:
      'Assign the first Team Lead of a vacancy at the `expectedVersion` the caller last saw (D130 (3); change and clear are not in Phase 2). Needs `vacancy.team_lead.set` for the vertical (Head Recruiter, Admin with aal2): a caller without the grant gets 403 and an unreadable vacancy is 404. The user must be an active, invited Team Lead of the vacancy vertical (D122), else 400 `invalid_team_lead` on `body.teamLeadId`. 409 `VACANCY_CLOSED` unless the vacancy is `OPEN` or `ON_HOLD`; 409 `TEAM_LEAD_ALREADY_SET` when another Team Lead is set; 409 `STALE_STATE` on a stale version; the Team Lead already set writes nothing and answers 200',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    body: setVacancyTeamLeadSchema,
    response: vacancyDetailSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body }) => setVacancyTeamLead(ctx, params.vacancyId, body),
);
