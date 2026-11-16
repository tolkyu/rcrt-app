import { assignableTeamLeadsSchema } from '@/lib/schemas/team-lead-priority';
import { verticalIdParamsSchema } from '@/lib/schemas/vertical';
import { defineRoute } from '@/server/http/route';
import { listAssignableTeamLeads } from '@/server/services/vacancy-team-lead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/verticals/{verticalId}/team-leads',
    operationId: 'listAssignableTeamLeads',
    permission: 'vertical.read',
    requireGrant: 'vacancy.team_lead.set',
    summary:
      'Team Leads that may be set on a vacancy of the vertical (Admin, Head Recruiter of the vertical): active, invite accepted, by priority. 403 without the grant, 404 for a vertical outside the caller’s reach',
    tags: ['Verticals'],
    params: verticalIdParamsSchema,
    response: assignableTeamLeadsSchema,
    errors: [403, 404],
  },
  (ctx, { params }) => listAssignableTeamLeads(ctx, params.verticalId),
);
