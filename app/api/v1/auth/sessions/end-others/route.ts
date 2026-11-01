import { endOtherSessionsResponseSchema } from '@/lib/schemas/auth';
import { defineRoute } from '@/server/http/route';
import { endOtherSessions } from '@/server/services/auth/session';

export const runtime = 'nodejs';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/auth/sessions/end-others',
    operationId: 'endOtherSessions',
    summary: 'End every other session of the current user',
    tags: ['Auth'],
    response: endOtherSessionsResponseSchema,
    errors: [],
  },
  (ctx) => endOtherSessions(ctx),
);
