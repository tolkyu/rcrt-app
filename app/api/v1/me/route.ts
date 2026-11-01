import { meSchema } from '@/lib/schemas/me';
import { updateMeSchema } from '@/lib/schemas/profile';
import { defineRoute } from '@/server/http/route';
import { getMe } from '@/server/services/me';
import { updateMyProfile } from '@/server/services/profile';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/me',
    operationId: 'getMe',
    summary: 'Current user, role assignments and effective permissions',
    tags: ['Profile'],
    response: meSchema,
    errors: [],
  },
  (ctx) => getMe(ctx),
);

export const PATCH = defineRoute(
  {
    method: 'PATCH',
    path: '/me',
    operationId: 'updateMe',
    summary: 'Change own display name (audited, user.profile_updated)',
    tags: ['Profile'],
    body: updateMeSchema,
    response: meSchema,
    errors: [400],
  },
  (ctx, { body }) => updateMyProfile(ctx, body),
);
