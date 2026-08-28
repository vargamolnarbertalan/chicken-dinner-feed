import { overlayInstanceIdSchema, overlayVisibilitySchema } from '@cdf/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { OverlayControlStore } from '../state/overlay-control-store.js';
import { CONTROL_TOKEN_HEADER, controlTokenRejection } from './control-token.js';

export interface OverlayControlRoutesOptions {
  store: OverlayControlStore;
  /**
   * Whether an instance actually exists in the configuration.
   *
   * Optional so the routes can be exercised on their own, but supplied in the real app. Without it
   * a mistyped Companion URL returns 200 and silently controls an overlay nobody is watching —
   * which looks, from behind a stream deck, exactly like a broken button.
   */
  isConfigured?: (instanceId: string) => boolean;
}

// The same id rules as everywhere else, so a malformed id is rejected here rather than quietly
// creating something unreachable.
const paramsSchema = z.object({
  instanceId: overlayInstanceIdSchema,
});

const querySchema = z.object({
  /** Accepted as a query parameter because Companion's HTTP module sets those most easily. */
  token: z.string().optional(),
});

/**
 * Control endpoints for stream-deck software, primarily Bitfocus Companion.
 *
 * Three deliberate concessions to how these are actually used:
 *
 * 1. **`GET` works as well as `POST`.** Strictly, a state change should not be a `GET`. But these
 *    are triggered by a hardware button on a loopback address, none of the usual reasons to care
 *    apply (no browser prefetch, no crawler, no caching proxy), and requiring `POST` would add a
 *    configuration step that operators get wrong under pressure.
 * 2. **Separate `show` / `hide` / `toggle` verbs** rather than one endpoint taking a boolean. A
 *    Companion button is a URL, so the action has to be in the URL.
 * 3. **Every response returns the resulting state**, so Companion can read it back for button
 *    feedback rather than tracking state it cannot see.
 */
export const overlayControlRoutes: FastifyPluginAsyncZod<OverlayControlRoutesOptions> = async (
  app,
  options,
) => {
  const { store, isConfigured } = options;

  /**
   * Accept a `POST` that declares JSON and sends nothing.
   *
   * These endpoints take everything from the URL, so a body is never needed — but a stream deck
   * configured to `POST` will happily send `content-type: application/json` with an empty body, and
   * the default parser rejects that as a bad request. On air that is a dead button, caused by a
   * technicality the operator cannot see. Scoped to this plugin, so the config routes still reject
   * an empty body where one is genuinely required.
   */
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_request, body, done: (error: Error | null, result?: unknown) => void) => {
      const raw = typeof body === 'string' ? body.trim() : '';
      if (raw === '') return done(null, {});

      try {
        done(null, JSON.parse(raw));
      } catch (cause) {
        // Fastify turns a parser error into a 500 unless it carries a status. The built-in JSON
        // parser sets 400; replacing it means taking that responsibility on too.
        const error = cause as Error & { statusCode?: number };
        error.statusCode = 400;
        done(error);
      }
    },
  );

  const responseSchema = {
    200: overlayVisibilitySchema,
    401: z.object({ error: z.string() }),
    404: z.object({ error: z.string() }),
  };

  function register(
    action: 'show' | 'hide' | 'toggle' | 'state',
    summary: string,
    apply: (instanceId: string) => ReturnType<OverlayControlStore['get']>,
  ): void {
    app.route({
      method: action === 'state' ? ['GET'] : ['GET', 'POST'],
      url: `/overlays/:instanceId/${action}`,
      schema: {
        summary,
        tags: ['overlay control'],
        params: paramsSchema,
        querystring: querySchema,
        response: responseSchema,
      },
      handler: async (request, reply) => {
        const rejection = controlTokenRejection(
          request.query.token,
          request.headers[CONTROL_TOKEN_HEADER],
        );
        if (rejection) {
          await reply.code(401).send({ error: rejection });
          return;
        }

        const { instanceId } = request.params;
        if (isConfigured && !isConfigured(instanceId)) {
          await reply
            .code(404)
            .send({ error: `No overlay with the id "${instanceId}". Check the address.` });
          return;
        }

        return apply(instanceId);
      },
    });
  }

  register('state', 'Read an overlay instance’s current visibility', (id) => store.get(id));
  register('show', 'Animate an overlay instance on air', (id) => store.set(id, true));
  register('hide', 'Animate an overlay instance off air', (id) => store.set(id, false));
  register('toggle', 'Flip an overlay instance’s visibility', (id) => store.toggle(id));
};
