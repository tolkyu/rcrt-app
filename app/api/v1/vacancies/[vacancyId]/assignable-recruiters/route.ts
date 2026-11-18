import { assignableRecruitersSchema } from '@/lib/schemas/vacancy-assignment';
import { vacancyIdParamsSchema } from '@/lib/schemas/vacancy';
import { defineRoute } from '@/server/http/route';
import { listAssignableRecruiters } from '@/server/services/vacancy-assignment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/vacancies/{vacancyId}/assignable-recruiters',
    operationId: 'listAssignableRecruiters',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.assign_recruiters',
    summary:
      'Recruiters that may be added to the vacancy: active, invite accepted, RECRUITER role in the vacancy vertical, plus everyone already assigned to it (`assigned`, `active`). 403 without the grant, 404 for an unreadable vacancy, 409 `VACANCY_CLOSED` unless the vacancy is `OPEN` or `ON_HOLD`',
    tags: ['Vacancies'],
    params: vacancyIdParamsSchema,
    response: assignableRecruitersSchema,
    errors: [403, 404, 409],
  },
  (ctx, { params }) => listAssignableRecruiters(ctx, params.vacancyId),
);
