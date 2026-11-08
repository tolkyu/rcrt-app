import {
  vacancyListQuerySchema,
  vacancyPageSchema,
} from '@/lib/schemas/vacancy';
import { defineRoute } from '@/server/http/route';
import { listVacancyPage } from '@/server/services/vacancy';

export const dynamic = 'force-dynamic';
export const GET = defineRoute(
  {
    method: 'GET',
    path: '/vacancies',
    operationId: 'listVacancies',
    permission: 'vacancy.read',
    summary: 'List visible vacancies in stable public-number order',
    tags: ['Vacancies'],
    query: vacancyListQuerySchema,
    response: vacancyPageSchema,
    errors: [404, 429],
  },
  (ctx, { query }) => listVacancyPage(ctx, query),
);
