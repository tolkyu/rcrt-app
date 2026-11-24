import { teamLeadPriorityVerticalsSchema } from '@/lib/schemas/team-lead-priority';
import { defineRoute } from '@/server/http/route';
import { listTeamLeadPriorityVerticals } from '@/server/services/team-lead-priority';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/settings/priorities/verticals',
    operationId: 'listTeamLeadPriorityVerticals',
    permission: 'settings.priorities.manage',
    summary: 'Vertical tabs for Team Lead priority settings (Admin aal2)',
    tags: ['Priorities'],
    response: teamLeadPriorityVerticalsSchema,
    errors: [404],
  },
  (ctx) => listTeamLeadPriorityVerticals(ctx),
);
