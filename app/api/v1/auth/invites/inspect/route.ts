import {
  inviteInspectResponseSchema,
  inviteTokenSchema,
} from '@/lib/schemas/auth';
import {
  authDependencies,
  definePublicAuthRoute,
} from '@/server/services/auth/app';
import { inspectInvite } from '@/server/services/auth/invite';

export const runtime = 'nodejs';
export const POST = definePublicAuthRoute(
  {
    path: '/auth/invites/inspect',
    operationId: 'inspectInvite',
    summary:
      'Show the invited name and roles; one INVALID state for any unusable invite',
    tags: ['Auth'],
    body: inviteTokenSchema,
    response: inviteInspectResponseSchema,
    errors: [429],
  },
  (ctx, body) => inspectInvite(authDependencies, ctx, body),
);
