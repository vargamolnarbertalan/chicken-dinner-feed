import { z } from 'zod';

/**
 * Whether an overlay instance is currently shown on air.
 *
 * This is **server-owned state**, not a client-side CSS concern. A director triggers it from a
 * stream deck (Bitfocus Companion) over HTTP, and every browser source rendering that instance has
 * to agree — including one that is reloaded mid-show and must come back in the right state.
 */
export const overlayVisibilitySchema = z.object({
  instanceId: z.string().min(1),
  visible: z.boolean(),
  /**
   * Epoch milliseconds of the last change.
   *
   * Lets a client tell a genuine transition from the state it was simply born into: an overlay page
   * opened while already visible must appear instantly, not animate in as though it had just been
   * triggered.
   */
  changedAt: z.number().int(),
});
export type OverlayVisibility = z.infer<typeof overlayVisibilitySchema>;
