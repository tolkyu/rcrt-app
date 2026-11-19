import {
  createPositionSchema,
  positionListQuerySchema,
  positionListSchema,
  positionSchema,
} from '@/lib/schemas/position';
import { defineRoute } from '@/server/http/route';
import {
  createPosition,
  listPositionCatalog,
} from '@/server/services/position';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/positions',
    operationId: 'listPositions',
    permission: 'position.read',
    summary:
      'Position catalog of the caller’s verticals (`status=all` is the manager view with inactive rows and open-vacancy counts)',
    tags: ['Positions'],
    query: positionListQuerySchema,
    response: positionListSchema,
    errors: [403, 404],
  },
  (ctx, { query }) => listPositionCatalog(ctx, query),
);

export const POST = defineRoute(
  {
    method: 'POST',
    path: '/positions',
    operationId: 'createPosition',
    permission: 'position.read',
    requireGrant: 'position.manage',
    summary:
      'Create an active position (Admin, Head Recruiter of the vertical; audited, position.created). 409 `POSITION_NAME_TAKEN` or `POSITION_LIMIT_REACHED` (300 per vertical); 429 after 30 writes per user per minute',
    tags: ['Positions'],
    body: createPositionSchema,
    response: positionSchema,
    successStatus: 201,
    errors: [403, 404, 409, 429],
  },
  (ctx, { body }) => createPosition(ctx, body),
);
