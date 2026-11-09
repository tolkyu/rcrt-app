import {
  createVacancySchema,
  vacancyDetailSchema,
  vacancyListQuerySchema,
  vacancyPageSchema,
} from '@/lib/schemas/vacancy';
import { defineRoute } from '@/server/http/route';
import { createVacancy, listVacancyPage } from '@/server/services/vacancy';

export const dynamic = 'force-dynamic';
export const GET = defineRoute(
  {
    method: 'GET',
    path: '/vacancies',
    operationId: 'listVacancies',
    permission: 'vacancy.read',
    summary:
      'List visible vacancies in stable public-number order (a DRAFT appears only for its author)',
    tags: ['Vacancies'],
    query: vacancyListQuerySchema,
    response: vacancyPageSchema,
    errors: [404, 429],
  },
  (ctx, { query }) => listVacancyPage(ctx, query),
);

export const POST = defineRoute(
  {
    method: 'POST',
    path: '/vacancies',
    operationId: 'createVacancy',
    permission: 'vacancy.read',
    requireGrant: 'vacancy.create',
    idempotent: true,
    summary:
      'Create an OPEN vacancy (`mode: PUBLISH`) or save the author’s private DRAFT (`mode: DRAFT`); Admin, Head Recruiter and Recruiter of the vertical (a Recruiter is auto-assigned; Team Leads use the request form). 201 also for an idempotent replay; 409 `IDEMPOTENCY_KEY_REUSED` or `POSITION_INACTIVE`; 429 after 30 writes per user per minute',
    tags: ['Vacancies'],
    body: createVacancySchema,
    response: vacancyDetailSchema,
    successStatus: 201,
    errors: [403, 404, 409, 429],
  },
  (ctx, { body, idempotencyKey }) => createVacancy(ctx, body, idempotencyKey),
);
