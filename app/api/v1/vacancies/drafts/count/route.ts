import { vacancyDraftCountSchema } from '@/lib/schemas/vacancy';
import { defineRoute } from '@/server/http/route';
import { countOwnDrafts } from '@/server/services/vacancy';

export const dynamic = 'force-dynamic';
export const GET = defineRoute(
  {
    method: 'GET',
    path: '/vacancies/drafts/count',
    operationId: 'countOwnVacancyDrafts',
    permission: 'vacancy.read',
    summary:
      'Count the caller’s own live DRAFT vacancies in the verticals where they still author (the «Чернетки» chip); 0 for a caller who authors nowhere',
    tags: ['Vacancies'],
    response: vacancyDraftCountSchema,
    errors: [404],
  },
  (ctx) => countOwnDrafts(ctx),
);
