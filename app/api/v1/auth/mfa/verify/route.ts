import { mfaVerifySchema, redirectResponseSchema } from '@/lib/schemas/auth';
import {
  authDependencies,
  defineAuthenticatedAuthRoute,
} from '@/server/services/auth/app';
import { verifyTotp } from '@/server/services/auth/mfa';

export const runtime = 'nodejs';
export const POST = defineAuthenticatedAuthRoute(
  {
    path: '/auth/mfa/verify',
    operationId: 'verifyTotp',
    summary:
      'Verify a TOTP code and raise the session to aal2; 5 failures lock for 15 min',
    tags: ['Auth'],
    body: mfaVerifySchema,
    response: redirectResponseSchema,
    errors: [401, 404, 429],
  },
  (ctx, body, cookies) => verifyTotp(authDependencies, ctx, body, cookies),
);
