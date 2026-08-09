import { z } from 'zod';
import { teamSchema } from './team.js';

/**
 * Where the match is in its lifecycle.
 *
 * Whether the PCOB API signals start and end explicitly is an open question
 * (specs/PCOB-FINDINGS.md, open question 4); the adapter infers it for now. Overlays should treat
 * `idle` as "nothing to show yet" rather than as an error state.
 */
export const matchPhaseSchema = z.enum(['idle', 'live', 'ended']);
export type MatchPhase = z.infer<typeof matchPhaseSchema>;

export const matchStateSchema = z.object({
  /** Null until a match is identified. PCOB's room/match identifier is unconfirmed. */
  matchId: z.string().nullable(),
  phase: matchPhaseSchema,
  /** Ordered by `rank`, so an overlay can render the array as-is. */
  teams: z.array(teamSchema),
  /** Teams with at least one player still standing. */
  standingTeamCount: z.number().int().min(0),
});
export type MatchState = z.infer<typeof matchStateSchema>;
