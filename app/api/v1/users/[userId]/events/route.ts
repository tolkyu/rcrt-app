import {
  userEventPageSchema,
  userEventsQuerySchema,
  userParamsSchema,
} from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { listUserEventPage } from '@/server/services/user';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/users/{userId}/events',
    operationId: 'listUserEvents',
    summary: 'User timeline, newest first, by cursor (Admin)',
    tags: ['Users'],
    params: userParamsSchema,
    query: userEventsQuerySchema,
    response: userEventPageSchema,
    errors: [404],
  },
  (ctx, { params, query }) => listUserEventPage(ctx, params.userId, query),
);
