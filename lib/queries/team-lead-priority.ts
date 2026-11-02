import { queryOptions } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
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

export const saveTeamLeadPriorities = (
  verticalId: string,
  changes: UpdateTeamLeadPrioritiesInput['changes'],
) =>
  apiRequest(`/verticals/${verticalId}/team-lead-priorities`, {
    method: 'PUT',
    body: { changes },
    schema: async () => (await schemas()).verticalTeamLeadPrioritiesSchema,
  });
