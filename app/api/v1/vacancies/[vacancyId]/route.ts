import {
  vacancyDetailSchema,
  vacancyIdParamsSchema,
} from '@/lib/schemas/vacancy';
import { defineRoute } from '@/server/http/route';
import { getVacancyDetail } from '@/server/services/vacancy';

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
