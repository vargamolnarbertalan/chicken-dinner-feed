import { z } from 'zod';

/**
 * Player state as the overlay needs to render it.
 *
 * This is **our** vocabulary, not PCOB's. The PCOB `LiveState` field exists but its enum values are
 * unconfirmed (ADR-0006, specs/PCOB-FINDINGS.md §2.1), so the ingestion adapter maps into these four
 * values and nothing downstream ever sees a raw PCOB value.
 *
 * `unknown` is deliberate: a player we have not heard about yet is not the same as a dead one, and
 * rendering them as dead on air would be wrong.
 */
export const playerLiveStateSchema = z.enum(['alive', 'knocked', 'dead', 'unknown']);
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
