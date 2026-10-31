import { verticalListSchema } from '@/lib/schemas/vertical';
import { defineRoute } from '@/server/http/route';
import { listVisibleVerticals } from '@/server/services/vertical';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/verticals',
    operationId: 'listVerticals',
    summary: 'Verticals visible to the caller',
    tags: ['Verticals'],
    response: verticalListSchema,
    errors: [404],
  },
  (ctx) => listVisibleVerticals(ctx),
);
