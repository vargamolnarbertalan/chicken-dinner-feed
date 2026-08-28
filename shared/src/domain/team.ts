import { z } from 'zod';
import { playerSchema } from './player.js';

/**
 * A team as the leaderboard renders it.
 *
 * Everything derived — alive count, points, rank — is computed **backend-side** and shipped in the
 * snapshot rather than recomputed per overlay. Two overlays showing different ranks for the same
 * moment would be a visible defect on air, and the scoring ruleset lives on the backend anyway
 * (ADR-0004): the PCOB API supplies no points at all (specs/PCOB-FINDINGS.md §2.4).
 */
export const teamSchema = z.object({
  /** 1–25, matching the PCOB `TeamNo` slot. This is the join key for roster and logo config. */
  teamNo: z.number().int().min(1).max(25),
  /** The only name a team has — see `teamRosterEntrySchema` in `config/team-roster.ts`. */
  name: z.string(),
  /** Resolved by the backend; null when the operator has not supplied a logo. */
  logoUrl: z.string().nullable(),
  players: z.array(playerSchema),

  /** Players not yet eliminated. Knocked players still count — they can be revived. */
  standingPlayerCount: z.number().int().min(0),
  /** Team total, the ELIMS column. */
  eliminations: z.number().int().min(0),

  killPoints: z.number().int().min(0),
  /**
   * Awarded on elimination or at match end, never before — a team that is still alive has not
   * placed yet. Modelling this as 0 while alive is correct here, unlike the after-match API fields.
   */
  placementPoints: z.number().int().min(0),
  /** The PTS column. */
  totalPoints: z.number().int().min(0),

  /** 1-based position in the current standings, the # column. */
  rank: z.number().int().min(1),
  /** Final placement, known only once the team is out or the match has ended. */
  placement: z.number().int().min(1).nullable(),
  isEliminated: z.boolean(),
  /**
   * Whether the ingest source has ever reported a player for this team **this match**.
   *
   * A roster is sized for a full tournament and reused for small test rooms — most roster slots may
   * never see a single player in a given match. `false` here is what tells the overlay to render
   * that team as absent rather than as "alive, no data yet" (the two used to be indistinguishable,
   * which let never-present teams outrank a real, placed team on screen).
   */
  hasAppeared: z.boolean(),
});
export type Team = z.infer<typeof teamSchema>;
