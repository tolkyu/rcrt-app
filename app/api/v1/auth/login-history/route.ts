import {
  loginHistoryQuerySchema,
  loginHistorySchema,
} from '@/lib/schemas/auth';
import { defineRoute } from '@/server/http/route';
import { listMyLoginHistory } from '@/server/services/auth/session';

export const dynamic = 'force-dynamic';
export const GET = defineRoute(
  {
    method: 'GET',
    path: '/auth/login-history',
    operationId: 'listMyLoginHistory',
    summary: 'Own sign-in history, newest first, cursor-paginated',
    tags: ['Auth'],
    query: loginHistoryQuerySchema,
    response: loginHistorySchema,
    errors: [400],
  },
  (ctx, { query }) => listMyLoginHistory(ctx, query),
);
