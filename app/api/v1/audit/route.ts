import { auditPageSchema, auditQuerySchema } from '@/lib/schemas/audit';
import { defineRoute } from '@/server/http/route';
import { listAudit } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/audit',
    operationId: 'listAudit',
    summary:
      'Audit log, newest first, filtered by view, Kyiv period, actor, action(s) and entity (Admin)',
    tags: ['Audit'],
    query: auditQuerySchema,
    response: auditPageSchema,
    errors: [404],
  },
  (ctx, { query }) => listAudit(ctx, query),
);
