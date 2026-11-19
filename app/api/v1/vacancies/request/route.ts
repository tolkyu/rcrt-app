import { vacancyDetailSchema } from '@/lib/schemas/vacancy';
import { requestVacancySchema } from '@/lib/schemas/vacancy-request';
import { requestsAnywhere } from '@/server/authz/vacancy-request';
import { defineRoute } from '@/server/http/route';
import { requestVacancy } from '@/server/services/vacancy-request';

export const dynamic = 'force-dynamic';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/vacancies/request',
    operationId: 'requestVacancy',
    permission: 'vacancy.read',
    hideUnless: requestsAnywhere,
    idempotent: true,
    summary:
      'Team Lead requests an unassigned OPEN vacancy in their vertical. Requires an accepted invite (D122). 201 on replay; inactive position: 400 body.positionId position_inactive; foreign position or no Team Lead grant: 404; reused key with another body: 409 IDEMPOTENCY_KEY_REUSED.',
    tags: ['Vacancies'],
    body: requestVacancySchema,
    response: vacancyDetailSchema,
    successStatus: 201,
    errors: [403, 404, 409, 429],
  },
  (ctx, { body, idempotencyKey }) => requestVacancy(ctx, body, idempotencyKey),
);
