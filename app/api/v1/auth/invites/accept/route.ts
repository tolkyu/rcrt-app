import { inviteTokenSchema, redirectResponseSchema } from '@/lib/schemas/auth';
import {
  authDependencies,
  definePublicAuthRoute,
} from '@/server/services/auth/app';
import { acceptInvite } from '@/server/services/auth/invite';

export const runtime = 'nodejs';
export const POST = definePublicAuthRoute(
  {
    path: '/auth/invites/accept',
    operationId: 'acceptInvite',
    summary: 'Accept an invite and sign in as the invited email',
    tags: ['Auth'],
    body: inviteTokenSchema,
    response: redirectResponseSchema,
    errors: [401, 409, 429],
  },
  (ctx, body, cookies) => acceptInvite(authDependencies, ctx, body, cookies),
);
