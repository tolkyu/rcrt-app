import {
  auditRecordParamsSchema,
  auditRecordSchema,
} from '@/lib/schemas/audit';
import { defineRoute } from '@/server/http/route';
import { getAuditRecord } from '@/server/services/audit';

export const dynamic = 'force-dynamic';

export const GET = defineRoute(
  {
    method: 'GET',
    path: '/audit/{recordId}',
    operationId: 'getAuditRecord',
    permission: 'audit.read',
    summary: 'One audit record with before/after and details (Admin)',
    tags: ['Audit'],
    params: auditRecordParamsSchema,
    response: auditRecordSchema,
    errors: [404],
  },
  (ctx, { params }) => getAuditRecord(ctx, params.recordId),
);
