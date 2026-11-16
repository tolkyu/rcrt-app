import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import { teamLeadKeys } from '@/lib/queries/team-leads';
import type { UpdateTeamLeadPrioritiesInput } from '@/lib/schemas/team-lead-priority';

/** Route-local keys: `lib/query-keys.ts` ships with every route, these only with «Пріоритети тімлідів» (PERF-04). */
export const priorityKeys = {
  verticals: () => ['settings', 'priority-verticals'] as const,
  vertical: (verticalId: string) =>
    ['settings', 'priorities', verticalId] as const,
};

const schemas = () => import('@/lib/schemas/team-lead-priority');

export const priorityVerticalsQuery = () =>
  queryOptions({
    queryKey: priorityKeys.verticals(),
    queryFn: ({ signal }) =>
      apiRequest('/settings/priorities/verticals', {
        signal,
        background: true,
        schema: async () => (await schemas()).teamLeadPriorityVerticalsSchema,
      }),
  });

export const teamLeadPrioritiesQuery = (verticalId: string) =>
  queryOptions({
    queryKey: priorityKeys.vertical(verticalId),
    queryFn: ({ signal }) =>
      apiRequest(`/verticals/${verticalId}/team-lead-priorities`, {
        signal,
        background: true,
        schema: async () => (await schemas()).verticalTeamLeadPrioritiesSchema,
      }),
  });

/** What a saved priority change makes stale. Literal users/audit prefixes instead of their key factories, which would pull their modules into this route (PERF-04); the vacancy form's Team Lead picker lists by this priority. */
export function invalidateAfterPrioritySave(queryClient: QueryClient) {
  for (const queryKey of [
    ['settings', 'user'],
    ['settings', 'users'],
    ['settings', 'audit'],
    teamLeadKeys.all,
  ])
    void queryClient.invalidateQueries({ queryKey });
}

export const saveTeamLeadPriorities = (
  verticalId: string,
  changes: UpdateTeamLeadPrioritiesInput['changes'],
) =>
  apiRequest(`/verticals/${verticalId}/team-lead-priorities`, {
    method: 'PUT',
    body: { changes },
    schema: async () => (await schemas()).verticalTeamLeadPrioritiesSchema,
  });
