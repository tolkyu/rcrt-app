import {
  inviteTokenSchema,
  oauthStartResponseSchema,
} from '@/lib/schemas/auth';
import {
  authDependencies,
  definePublicAuthRoute,
} from '@/server/services/auth/app';
import { startInviteGoogle } from '@/server/services/auth/invite';

export const runtime = 'nodejs';
export const POST = definePublicAuthRoute(
  {
    path: '/auth/invites/google',
    operationId: 'startInviteGoogle',
    summary:
      'Accept an invite with Google; consumed only if the Google email matches',
    tags: ['Auth'],
    body: inviteTokenSchema,
    response: oauthStartResponseSchema,
    errors: [404, 409, 429],
  },
  (ctx, body, cookies) =>
    startInviteGoogle(authDependencies, ctx, body, cookies),
);
