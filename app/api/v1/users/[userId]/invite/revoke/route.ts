import {
  userInviteActionSchema,
  userInviteRevokedSchema,
  userParamsSchema,
} from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { revokeInvite } from '@/server/services/auth/invite-manage';

export const runtime = 'nodejs';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/users/{userId}/invite/revoke',
    operationId: 'revokeUserInvite',
    summary:
      'Revoke the pending or expired invite; its link stops working (Admin with aal2)',
    tags: ['Users'],
    params: userParamsSchema,
    body: userInviteActionSchema,
    response: userInviteRevokedSchema,
    errors: [404, 409],
  },
  (ctx, { params }) => revokeInvite(ctx, params.userId),
);
