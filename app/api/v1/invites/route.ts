import {
  createInviteResponseSchema,
  createInviteSchema,
} from '@/lib/schemas/auth';
import { defineRoute } from '@/server/http/route';
import { authDependencies } from '@/server/services/auth/app';
import { createInvite } from '@/server/services/auth/invite';

export const runtime = 'nodejs';
export const POST = defineRoute(
  {
    method: 'POST',
    path: '/invites',
    operationId: 'createInvite',
    summary: 'Invite a person with roles (Admin with aal2 only)',
    tags: ['Users'],
    body: createInviteSchema,
    response: createInviteResponseSchema,
    successStatus: 201,
    errors: [404, 409],
  },
  (ctx, { body }) => createInvite(authDependencies, ctx, body),
);
