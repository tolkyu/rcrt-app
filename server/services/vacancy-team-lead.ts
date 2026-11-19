import type { AssignableTeamLeads } from '../../lib/schemas/team-lead-priority';
import { hasAnyGrant, requirePermission } from '../authz/can';
import type { VerticalId } from '../authz/types';
import type { RequestContext } from '../context/request-context';
import { ForbiddenError, NotFoundError } from '../http/errors';
import { uuidOf } from '../http/params';
import { findAssignableTeamLeads } from '../repositories/team-lead-priority';
import { authorizeAuthoring } from './vacancy';

/**
 * The Team Leads a creator may pick for `vacancy.team_lead.set`: same gate as `POST /vacancies` (Admin, Head Recruiter of the vertical),
 * same eligibility as the priorities page (active, invite accepted). A vertical outside the caller's reach is 404, a visible one without the grant 403.
 */
export async function listAssignableTeamLeads(
  ctx: RequestContext,
  rawVerticalId: string,
): Promise<AssignableTeamLeads> {
  requirePermission(ctx.auth, 'vertical.read');
  if (!hasAnyGrant(ctx.auth, 'vacancy.team_lead.set'))
    throw new ForbiddenError();
  const verticalId = uuidOf(rawVerticalId);
  if (!verticalId) throw new NotFoundError();
  authorizeAuthoring(ctx.auth, verticalId as VerticalId, {
    setsTeamLead: true,
    setsProbation: false,
  });
  const items = await findAssignableTeamLeads(ctx.db, verticalId);
  if (!items) throw new NotFoundError();
  return { items };
}
