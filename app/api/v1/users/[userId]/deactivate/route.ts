import {
  deactivateUserSchema,
  userActivationUpdatedSchema,
  userParamsSchema,
} from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { authDependencies } from '@/server/services/auth/app';
import { deactivateUser } from '@/server/services/user-activation';

export const runtime = 'nodejs';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/users/{userId}/deactivate',
    operationId: 'deactivateUser',
    summary:
      'Deactivate an accepted user and end every session (Admin aal2, D44/D45)',
    tags: ['Users'],
    params: userParamsSchema,
    body: deactivateUserSchema,
    response: userActivationUpdatedSchema,
    errors: [404, 409, 503],
  },
  (ctx, { params, body }) =>
    deactivateUser(authDependencies, ctx, params.userId, body),
);
