import {
  renameVerticalSchema,
  settingsVerticalSchema,
  verticalIdParamsSchema,
} from '@/lib/schemas/vertical';
import { defineRoute } from '@/server/http/route';
import { renameVertical } from '@/server/services/vertical';

export const dynamic = 'force-dynamic';

export const PATCH = defineRoute(
  {
    method: 'PATCH',
    path: '/verticals/{verticalId}',
    operationId: 'renameVertical',
    permission: 'settings.verticals.manage',
    summary: 'Rename a vertical (Admin, audited, vertical.renamed)',
    tags: ['Verticals'],
    params: verticalIdParamsSchema,
    body: renameVerticalSchema,
    response: settingsVerticalSchema,
    errors: [404, 409],
  },
  (ctx, { params, body }) => renameVertical(ctx, params.verticalId, body),
);
