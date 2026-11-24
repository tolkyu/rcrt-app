import {
  patchPositionSchema,
  positionIdParamsSchema,
  positionSchema,
} from '@/lib/schemas/position';
import { defineRoute } from '@/server/http/route';
import { patchPosition } from '@/server/services/position';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  {
    method: 'PATCH',
    path: '/positions/{positionId}',
    operationId: 'patchPosition',
    permission: 'position.read',
    requireGrant: 'position.manage',
    summary:
      'Rename, deactivate or reactivate a position (audited; no-op when nothing changes). 409 `POSITION_NAME_TAKEN` or `STALE_STATE`; 429 after 30 writes per user per minute',
    tags: ['Positions'],
    params: positionIdParamsSchema,
    body: patchPositionSchema,
    response: positionSchema,
    errors: [403, 404, 409, 429],
  },
  (ctx, { params, body }) => patchPosition(ctx, params.positionId, body),
);
