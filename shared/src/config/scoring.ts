import { z } from 'zod';
import { CONFIG_SCHEMA_VERSION } from '../versions.js';

/**
 * Tournament scoring rules.
 *
 * This exists because the PCOB API supplies **no points** — only raw kills, live state, and (as of
 * a 2026-08-28 live capture) the team's own placement via `rank` (specs/PCOB-API.md §6). Every
 * number in the PTS column is still ours to compute, and the rules differ per tournament, so they
 * are operator-configurable rather than hardcoded.
 */
export const scoringRulesetSchema = z.object({
  schemaVersion: z.number().int().min(1),
  id: z.string().min(1),
  name: z.string().min(1),
  /** Points per elimination, applied to the team total. */
  pointsPerElimination: z.number().int().min(0),
  /**
   * Placement points by final position: index 0 is 1st place, index 1 is 2nd, and so on. Positions
   * beyond the end of the array score zero, so a short array is valid and means "only the top N
   * score".
   */
  placementPoints: z.array(z.number().int().min(0)).min(1),
});
export type ScoringRuleset = z.infer<typeof scoringRulesetSchema>;

/**
 * The standard PUBG Mobile esports table (10/6/5/4/3/2/1/1 for the top eight, 1 point per kill),
 * used by PMGC and most regional circuits. A sensible default that an operator can adjust rather
 * than having to build from nothing before their first broadcast.
 */
export const DEFAULT_SCORING_RULESET: ScoringRuleset = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  id: 'pubgm-standard',
  name: 'PUBG Mobile standard (10/6/5/4/3/2/1/1, 1 per kill)',
  pointsPerElimination: 1,
  placementPoints: [10, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
};
