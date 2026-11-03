import {
  mfaResetResponseSchema,
  mfaResetSchema,
  userIdParamsSchema,
} from '@/lib/schemas/auth';
import { defineRoute } from '@/server/http/route';
import { authDependencies } from '@/server/services/auth/app';
import { resetUserMfa } from '@/server/services/auth/mfa';

export const runtime = 'nodejs';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/users/{userId}/mfa-reset',
    operationId: 'resetUserMfa',
    summary: 'Remove all TOTP factors of another user and end their sessions',
    tags: ['Users'],
    params: userIdParamsSchema,
    body: mfaResetSchema,
    response: mfaResetResponseSchema,
    errors: [403, 404, 503],
  },
  (ctx, { params, body }) =>
    resetUserMfa(authDependencies, ctx, {
      userId: params.userId,
      reason: body.reason,
    }),
);
