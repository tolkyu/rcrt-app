import {
  changeUserEmailSchema,
  userEmailChangedSchema,
  userParamsSchema,
} from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { authDependencies } from '@/server/services/auth/app';
import { changeInviteeEmail } from '@/server/services/auth/invite-manage';

export const runtime = 'nodejs';
export const PUT = defineRoute(
  {
    method: 'PUT',
    path: '/users/{userId}/email',
    operationId: 'changeUserEmail',
    summary:
      'Change the email of a never-activated user: the current link stops working, a new 72 h invite goes to the new address (Admin with aal2, D69)',
    tags: ['Users'],
    params: userParamsSchema,
    body: changeUserEmailSchema,
    response: userEmailChangedSchema,
    errors: [404, 409],
  },
  (ctx, { params, body }) =>
    changeInviteeEmail(authDependencies, ctx, params.userId, body),
);
