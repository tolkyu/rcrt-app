import {
  createVerticalSchema,
  settingsVerticalSchema,
  verticalListSchema,
} from '@/lib/schemas/vertical';
import { defineRoute } from '@/server/http/route';
import {
  createVertical,
  listVisibleVerticals,
} from '@/server/services/vertical';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/verticals',
    operationId: 'listVerticals',
    permission: 'vertical.read',
    summary: 'Verticals visible to the caller',
    tags: ['Verticals'],
    response: verticalListSchema,
    errors: [404],
  },
  (ctx) => listVisibleVerticals(ctx),
);

export const POST = defineRoute(
  {
    method: 'POST',
    path: '/verticals',
    operationId: 'createVertical',
    permission: 'settings.verticals.manage',
    summary: 'Create a vertical (Admin, audited, vertical.created)',
    tags: ['Verticals'],
    body: createVerticalSchema,
    response: settingsVerticalSchema,
    successStatus: 201,
    errors: [404, 409],
  },
  (ctx, { body }) => createVertical(ctx, body),
);
