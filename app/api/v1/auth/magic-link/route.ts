import {
  magicLinkRequestSchema,
  magicLinkResponseSchema,
} from '@/lib/schemas/auth';
import {
  authDependencies,
  definePublicAuthRoute,
} from '@/server/services/auth/app';
import { requestMagicLink } from '@/server/services/auth/magic-link';

export const runtime = 'nodejs';
export const POST = definePublicAuthRoute(
  {
    path: '/auth/magic-link',
    operationId: 'requestMagicLink',
    summary:
      'Request a sign-in link; report delivery failures for eligible users',
    tags: ['Auth'],
    body: magicLinkRequestSchema,
    response: magicLinkResponseSchema,
    errors: [429, 503],
  },
  (ctx, body) => requestMagicLink(authDependencies, ctx, body),
);
