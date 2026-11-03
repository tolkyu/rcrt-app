import {
  userInviteActionSchema,
  userInviteSentSchema,
  userParamsSchema,
} from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { authDependencies } from '@/server/services/auth/app';
import { reinviteUser } from '@/server/services/auth/invite-manage';

export const runtime = 'nodejs';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/users/{userId}/invite',
    operationId: 'reinviteUser',
    summary:
      'Invite again after a revoked invite: new 72 h link with the current roles (Admin with aal2, D70)',
    tags: ['Users'],
    params: userParamsSchema,
    body: userInviteActionSchema,
    response: userInviteSentSchema,
    successStatus: 201,
    errors: [404, 409],
  },
  (ctx, { params }) => reinviteUser(authDependencies, ctx, params.userId),
);
