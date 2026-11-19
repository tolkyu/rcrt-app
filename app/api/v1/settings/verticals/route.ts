import { settingsVerticalListSchema } from '@/lib/schemas/vertical';
import { defineRoute } from '@/server/http/route';
import { listSettingsVerticals } from '@/server/services/vertical';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/settings/verticals',
    operationId: 'listSettingsVerticals',
    permission: 'settings.verticals.manage',
    summary: 'All verticals with active user counts (Admin settings)',
    tags: ['Verticals'],
    response: settingsVerticalListSchema,
    errors: [404],
  },
  (ctx) => listSettingsVerticals(ctx),
);
