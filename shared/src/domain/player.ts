import { z } from 'zod';

/**
 * Player state as the overlay needs to render it.
 *
 * This is **our** vocabulary, not PCOB's. The adapter maps PCOB's numeric `liveState` into these
 * values and nothing downstream ever sees a raw PCOB number (ADR-0006). The PCOB enum is now
 * confirmed — 0 Normal, 1 On Plane, 2 On Parachute, 3 On Vehicle, 4 DBNO, 5 Dead, 6 Disconnected
 * (specs/PCOB-API.md §3) — and the first four all collapse to `alive`, because where a player is
 * standing is not something the leaderboard renders.
 *
 * Two values exist that PCOB has no single counterpart for:
 *
 * - `unknown` — we have not heard about this player yet. Rendering them as dead on air would be
 *   wrong, so this is distinct.
 * - `disconnected` — PCOB's state 6. Not dead and revivable by reconnecting, but not standing in a
 *   fight either. Folding it into `dead` would make the table resurrect someone on reconnect;
 *   folding it into `unknown` would conflate "gone" with "never seen".
 */
export const playerLiveStateSchema = z.enum([
  'alive',
  'knocked',
  'dead',
  'disconnected',
  'unknown',
]);
export type PlayerLiveState = z.infer<typeof playerLiveStateSchema>;

export const playerSchema = z.object({
  /** Stable within a match. How PCOB keys players is unconfirmed; the adapter owns that mapping. */
  id: z.string().min(1),
  name: z.string(),
  teamNo: z.number().int().min(1).max(25),
  /** Position within the team, 1–4. Fixes each player to one bar in the ALIVE column. */
  slot: z.number().int().min(1).max(4),
  liveState: playerLiveStateSchema,
  /** Current HP. Never assume a 0–100 range — use `healthMax` as the denominator. */
  health: z.number().min(0),
  healthMax: z.number().positive(),
  /**
   * Eliminations credited to this player. The adapter is responsible for keeping this stable after
   * death (PCOB exposes `KillNum` and `KillNumBeforeDie` separately).
   */
  kills: z.number().int().min(0),
});
export type Player = z.infer<typeof playerSchema>;
