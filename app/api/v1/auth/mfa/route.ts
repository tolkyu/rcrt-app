import { mfaStatusResponseSchema } from '@/lib/schemas/auth';
import { defineRoute } from '@/server/http/route';
import { authDependencies } from '@/server/services/auth/app';
import { mfaStatus } from '@/server/services/auth/mfa';

export const dynamic = 'force-dynamic';
export const GET = defineRoute(
  {
    method: 'GET',
    path: '/auth/mfa',
    operationId: 'getMfaStatus',
    summary: 'Own TOTP factors and whether Admin/Finance grants wait for aal2',
    tags: ['Auth'],
    response: mfaStatusResponseSchema,
    errors: [],
  },
  (ctx) => mfaStatus(authDependencies, ctx),
);
