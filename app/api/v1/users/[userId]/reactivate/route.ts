import {
  reactivateUserSchema,
  userActivationUpdatedSchema,
  userParamsSchema,
} from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { authDependencies } from '@/server/services/auth/app';
import { reactivateUser } from '@/server/services/user-activation';

export const runtime = 'nodejs';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/users/{userId}/reactivate',
    operationId: 'reactivateUser',
    summary:
      'Reactivate a user with a confirmed subset of their previous roles (Admin aal2, D44)',
    tags: ['Users'],
    params: userParamsSchema,
    body: reactivateUserSchema,
    response: userActivationUpdatedSchema,
    errors: [404, 409, 503],
  },
  (ctx, { params, body }) =>
    reactivateUser(authDependencies, ctx, params.userId, body),
);
