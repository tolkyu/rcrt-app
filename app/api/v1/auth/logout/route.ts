import { emptyRequestSchema, redirectResponseSchema } from '@/lib/schemas/auth';
import {
  authDependencies,
  definePublicAuthRoute,
} from '@/server/services/auth/app';
import { logout } from '@/server/services/auth/session';

export const runtime = 'nodejs';
// Public so that an expired or revoked session can still clear its cookies.
export const POST = definePublicAuthRoute(
  {
    path: '/auth/logout',
    operationId: 'logout',
    summary: 'End the current session and clear the session cookies',
    tags: ['Auth'],
    body: emptyRequestSchema,
    response: redirectResponseSchema,
    errors: [],
  },
  (ctx, _body, cookies) => logout(authDependencies, ctx, cookies),
);
