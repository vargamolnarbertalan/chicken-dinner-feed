import {
  DEFAULT_OVERLAY_APPEARANCE,
  overlayInstanceIdSchema,
  overlayInstanceSchema,
  overlayInstancesDocumentSchema,
  scoringRulesetSchema,
  teamRosterDocumentSchema,
} from '@cdf/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ConfigStore } from '../persistence/config-store.js';

export interface ConfigRoutesOptions {
  store: ConfigStore;
}

const errorSchema = z.object({ error: z.string() });

/**
 * Create takes only an id and a name; appearance starts from the defaults and is edited afterwards.
 * Asking an operator to supply a full appearance object to make an overlay would be absurd.
 */
const createInstanceSchema = z.object({
  id: overlayInstanceIdSchema,
  name: z.string().min(1).max(60),
  /** Copy another instance's look — the usual way a second overlay is made. */
  copyAppearanceFrom: overlayInstanceIdSchema.optional(),
});

/**
 * Configuration the admin reads and writes (ADR-0004).
 *
 * Whole-document writes rather than field-level patches: these documents are small, an operator
 * saves a form rather than a field, and a whole-document write validated against the schema cannot
 * leave a half-updated document behind.
 */
export const configRoutes: FastifyPluginAsyncZod<ConfigRoutesOptions> = async (app, options) => {
  const { store } = options;

  app.get(
    '/config/overlays',
    {
      schema: {
        summary: 'List overlay instances',
        tags: ['config'],
        response: { 200: overlayInstancesDocumentSchema },
      },
    },
    async () => store.instances.current,
  );

  app.post(
    '/config/overlays',
    {
      schema: {
        summary: 'Create an overlay instance',
        tags: ['config'],
        body: createInstanceSchema,
        response: { 201: overlayInstanceSchema, 409: errorSchema },
      },
    },
    async (request, reply) => {
      const { id, name, copyAppearanceFrom } = request.body;

      if (store.findInstance(id)) {
        return reply.code(409).send({ error: `An overlay with the id "${id}" already exists.` });
      }

      const source = copyAppearanceFrom ? store.findInstance(copyAppearanceFrom) : null;
      const created = {
        id,
        name,
        type: 'leaderboard' as const,
        appearance: source?.appearance ?? DEFAULT_OVERLAY_APPEARANCE,
      };

      await store.saveInstances([...store.instances.current.instances, created]);
      return reply.code(201).send(created);
    },
  );

  app.put(
    '/config/overlays/:instanceId',
    {
      schema: {
        summary: 'Replace an overlay instance',
        tags: ['config'],
        params: z.object({ instanceId: overlayInstanceIdSchema }),
        body: overlayInstanceSchema,
        response: { 200: overlayInstanceSchema, 400: errorSchema, 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params;
      const updated = request.body;

      if (updated.id !== instanceId) {
        // Renaming an id would silently break every browser source and Companion button already
        // pointing at it. Delete and recreate is the honest path.
        return reply
          .code(400)
          .send({ error: 'An overlay id cannot be changed. Create a new overlay instead.' });
      }
      if (!store.findInstance(instanceId)) {
        return reply.code(404).send({ error: `No overlay with the id "${instanceId}".` });
      }

      await store.saveInstances(
        store.instances.current.instances.map((instance) =>
          instance.id === instanceId ? updated : instance,
        ),
      );
      return reply.send(updated);
    },
  );

  app.delete(
    '/config/overlays/:instanceId',
    {
      schema: {
        summary: 'Delete an overlay instance',
        tags: ['config'],
        params: z.object({ instanceId: overlayInstanceIdSchema }),
        response: { 204: z.null(), 404: errorSchema },
      },
    },
    async (request, reply) => {
      const { instanceId } = request.params;
      if (!store.findInstance(instanceId)) {
        return reply.code(404).send({ error: `No overlay with the id "${instanceId}".` });
      }

      await store.saveInstances(
        store.instances.current.instances.filter((instance) => instance.id !== instanceId),
      );
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/config/teams',
    {
      schema: {
        summary: 'Read the team roster',
        tags: ['config'],
        response: { 200: teamRosterDocumentSchema },
      },
    },
    async () => store.teams.current,
  );

  app.put(
    '/config/teams',
    {
      schema: {
        summary: 'Replace the team roster',
        tags: ['config'],
        body: teamRosterDocumentSchema,
        response: { 200: teamRosterDocumentSchema, 400: errorSchema },
      },
    },
    async (request, reply) => {
      const teamNumbers = request.body.teams.map((team) => team.teamNo);
      if (new Set(teamNumbers).size !== teamNumbers.length) {
        // The team number is the join key to PCOB data, so a duplicate would silently merge two
        // teams' players into one row.
        return reply.code(400).send({ error: 'Each team number can only appear once.' });
      }

      return reply.send(await store.saveTeams(request.body));
    },
  );

  app.get(
    '/config/scoring',
    {
      schema: {
        summary: 'Read the scoring ruleset',
        tags: ['config'],
        response: { 200: scoringRulesetSchema },
      },
    },
    async () => store.scoring.current,
  );

  app.put(
    '/config/scoring',
    {
      schema: {
        summary: 'Replace the scoring ruleset',
        tags: ['config'],
        body: scoringRulesetSchema,
        response: { 200: scoringRulesetSchema },
      },
    },
    async (request) => store.saveScoring(request.body),
  );
};
