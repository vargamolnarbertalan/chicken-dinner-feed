import { z } from 'zod';
import { ingestStatusSchema } from '../domain/ingest.js';
import { matchStateSchema } from '../domain/match.js';
import { overlayVisibilitySchema } from '../domain/overlay.js';

/**
 * The complete live state, sent as a whole rather than as a delta (ADR-0007).
 *
 * A browser source can be opened, closed or reloaded at any point during a match, and must be
 * correct the instant it connects. At this payload size a delta protocol would buy nothing
 * measurable and would cost a class of desynchronisation bugs that only appear on air.
 */
export const liveSnapshotSchema = z.object({
  /**
   * Increments on every broadcast. Lets a client detect a backend restart (the revision goes
   * backwards) and makes "did anything change" trivially checkable in logs.
   */
  revision: z.number().int().min(0),
  /** Epoch milliseconds at which this snapshot was produced. */
  generatedAt: z.number().int(),
  ingest: ingestStatusSchema,
  match: matchStateSchema,
});
export type LiveSnapshot = z.infer<typeof liveSnapshotSchema>;

/**
 * Messages the server sends over `/ws/live`.
 *
 * Every message carries `protocolVersion` so a browser source left open across a backend upgrade
 * can tell that it no longer understands what it is being sent, and say so visibly instead of
 * rendering partial data.
 */
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    protocolVersion: z.number().int(),
    snapshot: liveSnapshotSchema,
  }),
  /**
   * Show/hide state for the instance this client is rendering.
   *
   * Kept as its own message rather than folded into the snapshot on purpose: match data is shared
   * by every overlay and changes constantly, while visibility is per-instance and changes only when
   * a director presses a button. Merging them would make one director's key press rebroadcast the
   * entire match state to every overlay in the production.
   */
  z.object({
    type: z.literal('overlay'),
    protocolVersion: z.number().int(),
    overlay: overlayVisibilitySchema,
  }),
  z.object({
    type: z.literal('error'),
    protocolVersion: z.number().int(),
    message: z.string(),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
