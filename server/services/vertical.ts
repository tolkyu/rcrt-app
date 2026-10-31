import type { VerticalList } from '../../lib/schemas/vertical';
import { requirePermission } from '../authz/can';
import { scopeWhere, verticalScope } from '../authz/scopes';
import type { RequestContext } from '../context/request-context';
import { listVerticals } from '../repositories/vertical';

/** Admin sees every vertical; other roles only verticals where they hold a role; Finance gets 404 (VIS-02-1, FIN-03). */
export async function listVisibleVerticals(
  ctx: RequestContext,
): Promise<VerticalList> {
  requirePermission(ctx.auth, 'vertical.read');
  const items = await listVerticals(
    ctx.db,
    scopeWhere(ctx.auth, 'vertical.read', verticalScope),
  );
  return { items };
}
