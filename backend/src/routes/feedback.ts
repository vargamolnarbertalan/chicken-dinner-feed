import {
  FEEDBACK_VERSION,
  PROTOCOL_VERSION,
  feedbackDocumentSchema,
  type OverlayFeedback,
} from '@cdf/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { config } from '../config.js';
import type { ConfigStore } from '../persistence/config-store.js';
import type { MatchStore } from '../state/match-store.js';
import type { OverlayControlStore } from '../state/overlay-control-store.js';
import { APP_VERSION } from '../version.js';
import type { LiveHub } from '../ws/live-hub.js';
import { CONTROL_TOKEN_HEADER, controlTokenRejection } from './control-token.js';

export interface FeedbackRoutesOptions {
  store: ConfigStore;
  overlayControl: OverlayControlStore;
  matchStore: MatchStore;
  hub: LiveHub;
}

const querySchema = z.object({
  token: z.string().optional(),
});

/**
 * Everything a `Host` header is allowed to look like before we will echo it back.
 *
 * The header is attacker-controlled in principle, and its value ends up inside URLs we hand to an
 * operator to paste into a button. Nothing here redirects on it, so the risk is modest — but the
 * set of legitimate values is small and easy to state, so we state it rather than reflect whatever
 * arrives. Covers `127.0.0.1:4317`, `localhost`, a venue hostname, and bracketed IPv6.
 */
const SAFE_HOST = /^\[?[a-z0-9.:-]+\]?(:\d{1,5})?$/i;

function baseUrlOf(request: FastifyRequest): string {
  const host = request.headers.host;
  const safe =
    typeof host === 'string' && SAFE_HOST.test(host) ? host : `${config.host}:${config.port}`;
  return `${request.protocol}://${safe}`;
}

/** Whole seconds are too coarse for a freshness readout that updates several times a second. */
function secondsSince(from: number | null, now: number): number | null {
  if (from === null || from === 0) return null;
  return Math.round((now - from) / 100) / 10;
}

/**
 * `GET /feedback` — one document describing everything a stream deck might want to light a button
 * with.
 *
 * Deliberately served **outside `/api`**, at the address the operator was told to use. It is the
 * one endpoint whose audience is a person configuring Companion rather than a program, and a short
 * address is easier to type correctly under pressure.
 *
 * Two properties this endpoint commits to, because button feedback depends on them:
 *
 * - **It is a snapshot, not a stream.** Companion polls it. Everything needed for one button is in
 *   one response, so a button never has to correlate two requests that could disagree.
 * - **It never partially fails.** Every field is computed from in-memory state, so there is no path
 *   where an overlay is missing from the document because something was slow. If the request
 *   answers at all, the answer is complete.
 *
 * The response shape is a stable projection rather than the internal configuration — see the note
 * on `feedbackDocumentSchema` for why that separation is load-bearing.
 */
export const feedbackRoutes: FastifyPluginAsyncZod<FeedbackRoutesOptions> = async (
  app,
  options,
) => {
  const { store, overlayControl, matchStore, hub } = options;

  app.get(
    '/feedback',
    {
      schema: {
        summary: 'Everything a stream deck needs to drive button feedback',
        description:
          'A single snapshot of overlay state, data-feed health and match progress, keyed by ' +
          'overlay id. Intended to be polled by Bitfocus Companion. Guarded by CONTROL_TOKEN ' +
          'when one is set, exactly like the show/hide endpoints.',
        tags: ['system'],
        querystring: querySchema,
        response: {
          200: feedbackDocumentSchema,
          401: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const rejection = controlTokenRejection(
        request.query.token,
        request.headers[CONTROL_TOKEN_HEADER],
      );
      if (rejection) {
        await reply.code(401).send({ error: rejection });
        return;
      }

      const now = Date.now();
      const base = baseUrlOf(request);
      const { ingest, match } = matchStore.project();

      const overlays: Record<string, OverlayFeedback> = {};
      for (const instance of store.instances.current.instances) {
        const visibility = overlayControl.get(instance.id);
        const sources = hub.sourceCountFor(instance.id);
        const { appearance } = instance;

        overlays[instance.id] = {
          id: instance.id,
          name: instance.name,
          type: instance.type,

          isVisible: visibility.visible,
          changedAt: visibility.changedAt,
          secondsSinceChange: secondsSince(visibility.changedAt, now),

          connectedSources: sources,
          hasConnectedSource: sources > 0,

          url: `${base}/overlay/${instance.id}`,
          appearance: {
            anchor: appearance.anchor,
            offsetX: appearance.offsetX,
            offsetY: appearance.offsetY,
            // Stored as a multiplier, reported as the percentage the admin shows — the number an
            // operator would recognise if they went looking for it in the UI.
            scalePercent: Math.round(appearance.scale * 100),
            fontFamily: appearance.fontFamily,
            maxTeams: appearance.maxTeams,
            showLegend: appearance.showLegend,
            colors: appearance.colors,
            animation: appearance.animation,
          },
          actions: {
            show: `${base}/api/overlays/${instance.id}/show`,
            hide: `${base}/api/overlays/${instance.id}/hide`,
            toggle: `${base}/api/overlays/${instance.id}/toggle`,
            state: `${base}/api/overlays/${instance.id}/state`,
          },
        };
      }

      // Teams arrive ordered by rank, so the leader is simply the first one.
      const leader = match.teams[0] ?? null;

      return {
        feedbackVersion: FEEDBACK_VERSION,
        generatedAt: now,

        app: {
          name: 'chicken-dinner-feed',
          version: APP_VERSION,
          isRunning: true as const,
          uptimeSeconds: Math.round(process.uptime()),
          protocolVersion: PROTOCOL_VERSION,
          baseUrl: base,
        },

        data: {
          source: ingest.source,
          state: ingest.state,
          isReceivingData: ingest.state === 'connected',
          isStale: ingest.state === 'stale',
          lastUpdateAt: ingest.lastUpdateAt,
          secondsSinceUpdate: secondsSince(ingest.lastUpdateAt, now),
          message: ingest.message,
        },

        match: {
          phase: match.phase,
          isLive: match.phase === 'live',
          matchId: match.matchId,
          teamCount: match.teams.length,
          standingTeamCount: match.standingTeamCount,
          leader: leader
            ? {
                teamNo: leader.teamNo,
                name: leader.name,
                totalPoints: leader.totalPoints,
                eliminations: leader.eliminations,
              }
            : null,
        },

        overlays,

        actions: {
          feedback: `${base}/feedback`,
          health: `${base}/api/health`,
          apiDocs: `${base}/api/docs`,
          admin: `${base}/admin`,
        },
      };
    },
  );
};
