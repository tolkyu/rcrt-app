import {
  auditActorPageSchema,
  auditActorQuerySchema,
} from '@/lib/schemas/audit';
import { defineRoute } from '@/server/http/route';
import { listAuditActors } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/audit/actors',
    operationId: 'listAuditActors',
    permission: 'audit.read',
    summary:
      'Users for the audit «Хто» filter by full name or email, active first (Admin)',
    tags: ['Audit'],
    query: auditActorQuerySchema,
    response: auditActorPageSchema,
    errors: [404, 429],
  },
  (ctx, { query }) => listAuditActors(ctx, query),
);
