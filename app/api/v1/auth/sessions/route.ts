import { sessionListSchema } from '@/lib/schemas/auth';
import { defineRoute } from '@/server/http/route';
import { listMySessions } from '@/server/services/auth/session';

export const dynamic = 'force-dynamic';
export const GET = defineRoute(
  {
    method: 'GET',
    path: '/auth/sessions',
    operationId: 'listMySessions',
    summary: 'Own active sessions',
    tags: ['Auth'],
    response: sessionListSchema,
    errors: [],
  },
  (ctx) => listMySessions(ctx),
);
