import {
  magicLinkConfirmSchema,
  redirectResponseSchema,
} from '@/lib/schemas/auth';
import {
  authDependencies,
  definePublicAuthRoute,
} from '@/server/services/auth/app';
import { confirmMagicLink } from '@/server/services/auth/magic-link';

export const runtime = 'nodejs';
export const POST = definePublicAuthRoute(
  {
    path: '/auth/confirm',
    operationId: 'confirmMagicLink',
    summary: 'Consume a sign-in link after the explicit button press',
    tags: ['Auth'],
    body: magicLinkConfirmSchema,
    response: redirectResponseSchema,
    errors: [401, 429],
  },
  (ctx, body, cookies) =>
    confirmMagicLink(authDependencies, ctx, body, cookies),
);
