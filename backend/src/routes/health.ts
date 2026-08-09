import { PROTOCOL_VERSION } from '@cdf/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { config } from '../config.js';

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  protocolVersion: z.number().int(),
  ingestSource: z.enum(['mock', 'pcob']),
  uptimeSeconds: z.number(),
});

/**
 * A liveness endpoint that `startup.bat` can poll to know when the server is actually ready,
 * rather than guessing with a sleep.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: {
        summary: 'Liveness and build information',
        tags: ['system'],
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({
      status: 'ok' as const,
      version: '0.1.0',
      protocolVersion: PROTOCOL_VERSION,
      ingestSource: config.ingestSource,
      uptimeSeconds: Math.round(process.uptime()),
    }),
  );
};
