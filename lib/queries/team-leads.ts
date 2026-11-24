import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { retryServerErrors } from '@/lib/queries/vacancy-detail';

/** Route-local key (`lib/query-keys.ts` ships with every route); the prefix is invalidated by «Пріоритети тімлідів». */
export const teamLeadKeys = {
  all: ['team-leads'] as const,
  assignable: (verticalId: string) =>
    ['team-leads', verticalId.toLowerCase()] as const,
};

/** Team Leads a creator may set in one vertical (`vacancy.team_lead.set`); fresh for a minute like the position list, the server re-checks the choice on create. */
export const assignableTeamLeadsQuery = (verticalId: string) =>
  queryOptions({
    queryKey: teamLeadKeys.assignable(verticalId),
    staleTime: 60_000,
    retry: retryServerErrors,
    queryFn: ({ signal }) =>
      apiRequest(`/verticals/${verticalId}/team-leads`, {
        schema: async () =>
          (await import('@/lib/schemas/team-lead-priority'))
            .assignableTeamLeadsSchema,
        signal,
        background: true,
      }),
  });
