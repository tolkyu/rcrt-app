import { userDetailSchema, userParamsSchema } from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { getUserDetail } from '@/server/services/user';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/users/{userId}',
    operationId: 'getUser',
    summary:
      'One user: profile, roles, TL priorities, invite state and 2FA state (Admin)',
    tags: ['Users'],
    params: userParamsSchema,
    response: userDetailSchema,
    errors: [404],
  },
  (ctx, { params }) => getUserDetail(ctx, params.userId),
);
