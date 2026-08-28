import { z } from 'zod';
import { overlayAnimationSchema, overlayColorsSchema } from '../config/overlay-instance.js';
import { ingestConnectionStateSchema, ingestSourceKindSchema } from '../domain/ingest.js';
import { matchPhaseSchema } from '../domain/match.js';

/**
 * The document served at `/feedback`, for stream-deck software to poll.
 *
 * **This is a public contract, and a deliberately conservative one.** Once a Bitfocus Companion
 * button reads `overlays.main.isVisible`, that path is load-bearing in someone's production — and
 * Hyrum's Law says every observable detail here will end up depended on, documented or not. So it
 * is a *projection*, defined separately from the persisted configuration rather than echoing it:
 * the internal config schema can then change without silently breaking a button that has worked for
 * a year. Where the two look alike today, that is a coincidence to be maintained, not a shortcut.
 *
 * Design choices that follow from the consumer being a hardware button:
 *
 * - **Overlays are keyed by id, not listed.** A button refers to its own overlay by name, so adding
 *   or deleting another one cannot make it silently point somewhere else — which array indices
 *   would.
 * - **Every condition worth a feedback has a boolean.** Comparing `state === 'connected'` is a
 *   string comparison an operator has to get exactly right; `isReceivingData` is not.
 * - **Times are given twice**: an epoch stamp for anything doing arithmetic, and a seconds-ago
 *   number for anything that just wants to show or threshold it.
 * - **URLs are absolute**, built from the address the request arrived on, so they can be pasted
 *   straight into a button without knowing how the app is reachable.
 */

/** Bumped only on a breaking change, so a setup can detect one rather than misbehave quietly. */
export const FEEDBACK_VERSION = 2;

const overlayFeedbackAppearanceSchema = z.object({
  anchor: z.enum(['left', 'right']),
  offsetX: z.number().int(),
  offsetY: z.number().int().nullable(),
  /** Given as a percentage, which is how the admin presents it. */
  scalePercent: z.number().int(),
  fontFamily: z.string(),
  maxTeams: z.number().int(),
  showLegend: z.boolean(),
  colors: overlayColorsSchema,
  animation: overlayAnimationSchema,
});

export const overlayFeedbackSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),

  /** Whether it is on screen right now. The single most useful value here. */
  isVisible: z.boolean(),
  /** Epoch milliseconds of the last show/hide; 0 if it has never been changed. */
  changedAt: z.number().int(),
  secondsSinceChange: z.number().nullable(),

  /**
   * Browser sources currently rendering this overlay, **excluding the admin's own preview**.
   *
   * Worth a button of its own: an overlay can be "visible" with nothing connected to display it,
   * which looks identical to a working setup until you are on air.
   */
  connectedSources: z.number().int(),
  hasConnectedSource: z.boolean(),

  /** What to put in a browser source. */
  url: z.string(),
  appearance: overlayFeedbackAppearanceSchema,
  actions: z.object({
    show: z.string(),
    hide: z.string(),
    toggle: z.string(),
    state: z.string(),
  }),
});
export type OverlayFeedback = z.infer<typeof overlayFeedbackSchema>;

export const feedbackDocumentSchema = z.object({
  feedbackVersion: z.number().int(),
  generatedAt: z.number().int(),

  app: z.object({
    name: z.string(),
    version: z.string(),
    /** Always true in a response — reaching this document at all is the health check. */
    isRunning: z.literal(true),
    uptimeSeconds: z.number().int(),
    protocolVersion: z.number().int(),
    baseUrl: z.string(),
  }),

  /** Health of the feed from the game. What an operator actually wants a lamp for. */
  data: z.object({
    source: ingestSourceKindSchema,
    state: ingestConnectionStateSchema,
    /** Connected *and* fresh. The condition a "data OK" button should test. */
    isReceivingData: z.boolean(),
    /** Connected but nothing new recently — usually the room host dropping. */
    isStale: z.boolean(),
    lastUpdateAt: z.number().int().nullable(),
    secondsSinceUpdate: z.number().nullable(),
    message: z.string().nullable(),
  }),

  match: z.object({
    phase: matchPhaseSchema,
    isLive: z.boolean(),
    matchId: z.string().nullable(),
    teamCount: z.number().int(),
    standingTeamCount: z.number().int(),
    leader: z
      .object({
        teamNo: z.number().int(),
        name: z.string(),
        totalPoints: z.number().int(),
        eliminations: z.number().int(),
      })
      .nullable(),
  }),

  /** Keyed by overlay id — see the note above on why this is not a list. */
  overlays: z.record(z.string(), overlayFeedbackSchema),

  /** Application-level addresses, so everything reachable is discoverable from one document. */
  actions: z.object({
    feedback: z.string(),
    health: z.string(),
    apiDocs: z.string(),
    admin: z.string(),
  }),
});
export type FeedbackDocument = z.infer<typeof feedbackDocumentSchema>;
