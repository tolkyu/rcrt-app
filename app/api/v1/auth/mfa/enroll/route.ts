import {
  emptyRequestSchema,
  mfaEnrollResponseSchema,
} from '@/lib/schemas/auth';
import {
  authDependencies,
  defineAuthenticatedAuthRoute,
} from '@/server/services/auth/app';
import { enrollTotp } from '@/server/services/auth/mfa';

export const runtime = 'nodejs';
export const POST = defineAuthenticatedAuthRoute(
  {
    path: '/auth/mfa/enroll',
    operationId: 'enrollTotp',
    summary: 'Start TOTP enrolment; adding a second device needs aal2',
    tags: ['Auth'],
    body: emptyRequestSchema,
    response: mfaEnrollResponseSchema,
    errors: [401, 409, 429],
  },
  (ctx, _body, cookies) => enrollTotp(authDependencies, ctx, cookies),
);
