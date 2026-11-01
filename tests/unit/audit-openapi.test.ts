import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { describe, expect, it } from 'vitest';
import { auditRecordSchema } from '@/lib/schemas/audit';

describe('Audit record OpenAPI contract [STORY-AUD-2, FND-4]', () => {
  it('generates nullable arbitrary JSON payloads without recursively expanding z.json()', () => {
    const registry = new OpenAPIRegistry();
    registry.registerPath({
      method: 'get',
      path: '/audit/{recordId}',
      responses: {
        200: {
          description: 'Audit record',
          content: { 'application/json': { schema: auditRecordSchema } },
        },
      },
    });
    const document = new OpenApiGeneratorV31(
      registry.definitions,
    ).generateDocument({
      openapi: '3.1.0',
      info: { title: 'Audit regression', version: '1.0.0' },
    });
    expect(document.components?.schemas?.AuditRecord).toMatchObject({
      properties: {
        before: {
          type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
        },
        after: {
          type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
        },
        details: {
          type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
        },
      },
    });
  });

  it('keeps runtime JSON validation after adding documentation metadata', () => {
    const payload = auditRecordSchema.shape.before;
    expect(
      payload.parse({ fields: ['name', null], active: true, version: 2 }),
    ).toEqual({
      fields: ['name', null],
      active: true,
      version: 2,
    });
    expect(payload.parse(null)).toBeNull();
    expect(payload.safeParse({ missing: undefined }).success).toBe(false);
    expect(payload.safeParse({ invalid: Infinity }).success).toBe(false);
  });
});
