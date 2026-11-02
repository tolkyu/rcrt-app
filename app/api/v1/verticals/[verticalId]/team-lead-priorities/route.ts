import {
  teamLeadPriorityParamsSchema,
  updateTeamLeadPrioritiesSchema,
  verticalTeamLeadPrioritiesSchema,
} from '@/lib/schemas/team-lead-priority';
import { defineRoute } from '@/server/http/route';
import {
  getVerticalTeamLeadPriorities,
  updateTeamLeadPriorities,
} from '@/server/services/team-lead-priority';

export const runtime = 'nodejs';
export const GET = defineRoute(
  {
    method: 'GET',
    path: '/verticals/{verticalId}/team-lead-priorities',
    operationId: 'getVerticalTeamLeadPriorities',
    summary: 'Active accepted Team Leads and their priorities (Admin aal2)',
    tags: ['Priorities'],
    params: teamLeadPriorityParamsSchema,
    response: verticalTeamLeadPrioritiesSchema,
    errors: [404],
  },
  (ctx, { params }) => getVerticalTeamLeadPriorities(ctx, params.verticalId),
);
export const PUT = defineRoute(
  {
    method: 'PUT',
    path: '/verticals/{verticalId}/team-lead-priorities',
    operationId: 'updateTeamLeadPriorities',
    summary:
      'Atomically change Team Lead priorities with per-row versions (Admin aal2, D73)',
    tags: ['Priorities'],
    params: teamLeadPriorityParamsSchema,
    body: updateTeamLeadPrioritiesSchema,
    response: verticalTeamLeadPrioritiesSchema,
    errors: [400, 404, 409],
  },
  (ctx, { params, body }) =>
    updateTeamLeadPriorities(ctx, params.verticalId, body),
);
