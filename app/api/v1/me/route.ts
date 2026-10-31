import { meSchema } from '@/lib/schemas/me';
import { defineRoute } from '@/server/http/route';
import { getMe } from '@/server/services/me';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/me',
    operationId: 'getMe',
    summary: 'Current user, role assignments and effective permissions',
    tags: ['Profile'],
    response: meSchema,
    errors: [],
  },
  (ctx) => getMe(ctx),
);
