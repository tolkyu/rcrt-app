import { queryOptions } from '@tanstack/react-query';
import { ApiError, apiRequest } from '@/lib/api-client';

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
    retry: (count, error) =>
      !(error instanceof ApiError && error.status < 500) && count < 2,
    queryFn: ({ signal }) =>
      apiRequest(`/verticals/${verticalId}/team-leads`, {
        schema: async () =>
          (await import('@/lib/schemas/team-lead-priority'))
            .assignableTeamLeadsSchema,
        signal,
        background: true,
      }),
  });
