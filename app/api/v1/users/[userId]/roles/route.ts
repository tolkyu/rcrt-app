import {
  updateUserRolesSchema,
  userParamsSchema,
  userRolesUpdatedSchema,
} from '@/lib/schemas/user';
import { defineRoute } from '@/server/http/route';
import { updateUserRoles } from '@/server/services/user-roles';

export const runtime = 'nodejs';
export const PUT = defineRoute(
  {
    method: 'PUT',
    path: '/users/{userId}/roles',
    operationId: 'updateUserRoles',
    summary:
      'Replace the roles × verticals of a user; takes effect on their next request (Admin with aal2, ROLE-01, D40, D45)',
    tags: ['Users'],
    params: userParamsSchema,
    body: updateUserRolesSchema,
    response: userRolesUpdatedSchema,
    errors: [400, 404, 409],
  },
  (ctx, { params, body }) => updateUserRoles(ctx, params.userId, body),
);
