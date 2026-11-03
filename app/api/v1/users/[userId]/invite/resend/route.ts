import {
  userInviteActionSchema,
  userInviteSentSchema,
  userParamsSchema,
} from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { authDependencies } from '@/server/services/auth/app';
import { resendInvite } from '@/server/services/auth/invite-manage';

export const runtime = 'nodejs';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/users/{userId}/invite/resend',
    operationId: 'resendUserInvite',
    summary:
      'Resend the pending or expired invite: new 72 h link, the previous one stops working (Admin with aal2)',
    tags: ['Users'],
    params: userParamsSchema,
    body: userInviteActionSchema,
    response: userInviteSentSchema,
    errors: [404, 409],
  },
  (ctx, { params }) => resendInvite(authDependencies, ctx, params.userId),
);
