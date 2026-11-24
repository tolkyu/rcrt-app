import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

export const API_BASE_PATH = '/api/v1';

export const problemSchema = z
  .object({
    type: z.string(),
    status: z.number().int(),
    code: z.string(),
    requestId: z.uuid(),
    errors: z
      .array(z.object({ path: z.string(), code: z.string() }))
      .optional(),
    details: z.record(z.string(), z.string()).optional().meta({
      description:
        'Ids the caller may act on next, e.g. `userId` of the deactivated holder of an invited address.',
    }),
  })
  .meta({
    id: 'Problem',
    description: 'RFC 9457 problem details; `code` is a stable error code.',
  });

export function createApiRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Supabase access token of an invited user.',
  });
  return registry;
}

/** Routes register here as their modules load; `pnpm api:openapi` imports every route module first. */
export const apiRegistry = createApiRegistry();

export function buildOpenApiDocument(registry: OpenAPIRegistry = apiRegistry) {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'HRIS Recruiting API',
      version: '1.0.0',
      description:
        'REST API used by the web UI and Postman. Unsafe methods require `Origin` equal to the app origin, `Content-Type: application/json` and `X-CSRF-Protection: 1`.',
    },
    servers: [
      {
        url: `{origin}${API_BASE_PATH}`,
        variables: { origin: { default: 'http://localhost:3000' } },
      },
    ],
    security: [{ bearerAuth: [] }],
  });
}
