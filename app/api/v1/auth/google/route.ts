import {
  emptyRequestSchema,
  oauthStartResponseSchema,
} from '@/lib/schemas/auth';
import {
  authDependencies,
  definePublicAuthRoute,
} from '@/server/services/auth/app';
import { startGoogle } from '@/server/services/auth/google';

export const runtime = 'nodejs';
export const POST = definePublicAuthRoute(
  {
    path: '/auth/google',
    operationId: 'startGoogleSignIn',
    summary: 'Start Google sign-in (PKCE); 404 when Google is not configured',
    tags: ['Auth'],
    body: emptyRequestSchema,
    response: oauthStartResponseSchema,
    errors: [404, 429],
  },
  (ctx, _body, cookies) => startGoogle(authDependencies, ctx, cookies),
);
