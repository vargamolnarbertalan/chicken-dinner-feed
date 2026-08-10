import { overlayVisibilitySchema } from '@cdf/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { config } from '../config.js';
import type { OverlayControlStore } from '../state/overlay-control-store.js';

export interface OverlayControlRoutesOptions {
  store: OverlayControlStore;
}

const paramsSchema = z.object({
  instanceId: z.string().min(1),
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
  const { store } = options;

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
        done(cause as Error);
      }
    },
  );

  /**
   * Optional shared secret, off by default.
   *
   * Loopback binding is the real control (ADR-0008). This exists for the one setup that needs
   * more: Companion running on a different machine, which requires binding to the network and
   * therefore exposes these endpoints to anyone on the venue LAN. It is a speed bump against
   * accidents and curious people on the same network, not authentication.
   */
  function rejectIfTokenInvalid(provided: string | undefined, header: unknown): string | null {
    if (!config.controlToken) return null;
    const supplied = provided ?? (typeof header === 'string' ? header : undefined);
    return supplied === config.controlToken ? null : 'Invalid or missing control token.';
  }

  const responseSchema = {
    200: overlayVisibilitySchema,
    401: z.object({ error: z.string() }),
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
        const rejection = rejectIfTokenInvalid(
          request.query.token,
          request.headers['x-control-token'],
        );
        if (rejection) {
          await reply.code(401).send({ error: rejection });
          return;
        }

        return apply(request.params.instanceId);
      },
    });
  }

  register('state', 'Read an overlay instance’s current visibility', (id) => store.get(id));
  register('show', 'Animate an overlay instance on air', (id) => store.set(id, true));
  register('hide', 'Animate an overlay instance off air', (id) => store.set(id, false));
  register('toggle', 'Flip an overlay instance’s visibility', (id) => store.toggle(id));
};
