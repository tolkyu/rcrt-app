import { userListQuerySchema, userPageSchema } from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { listUserPage } from '@/server/services/user';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/users',
    operationId: 'listUsers',
    summary:
      'Users with derived status, roles, 2FA state and last sign-in; search and filters (Admin)',
    tags: ['Users'],
    query: userListQuerySchema,
    response: userPageSchema,
    errors: [400, 404],
  },
  (ctx, { query }) => listUserPage(ctx, query),
);
