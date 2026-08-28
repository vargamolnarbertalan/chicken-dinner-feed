import type { Player, ScoringRuleset, Team, TeamRosterEntry } from '@cdf/shared';
import type { IngestPlayer } from '../ingest/source.js';

export interface StandingsInput {
  players: readonly IngestPlayer[];
  roster: readonly TeamRosterEntry[];
  ruleset: ScoringRuleset;
  /**
   * Final placement per team, 1-based, for teams whose placement is already decided. A team still
   * in the match has not placed yet and must not be given placement points.
   */
  placements: ReadonlyMap<number, number>;
  /**
   * Team numbers the ingest source has reported at least one player for, this match. Optional so a
   * caller with nothing to say about presence (mostly tests) is not forced to spell out "everyone in
   * the roster" — defaults to exactly that, which reproduces the old behaviour.
   */
  presentTeams?: ReadonlySet<number>;
}

/**
 * A player still in the fight.
 *
 * Knocked players count — they can be revived. So do disconnected ones: PCOB reports them as state
 * 6, they are not eliminated, and they can come back. Excluding them would place their team early
 * and hand out placement points for a game the team is still in.
 */
function isStanding(player: { liveState: IngestPlayer['liveState'] }): boolean {
  return (
    player.liveState === 'alive' ||
    player.liveState === 'knocked' ||
    player.liveState === 'disconnected'
  );
}

function placementPointsFor(placement: number | undefined, ruleset: ScoringRuleset): number {
  if (placement === undefined) return 0;
  // Positions past the end of the table score nothing, so a short table means "only the top N score".
  return ruleset.placementPoints[placement - 1] ?? 0;
}

/**
 * Turn raw ingested players into the ranked standings the overlay renders.
 *
 * This is entirely our logic: the PCOB API supplies kills and live state, and nothing else in the
 * PTS or # columns (specs/PCOB-FINDINGS.md §2.4). Computing it here rather than per overlay means
 * two overlays can never disagree about the standings at the same moment.
 *
 * Every roster team appears in the table, even ones the ingest has never reported a player for — so
 * a team the match simply has not gotten to yet renders as present-but-unknown rather than
 * vanishing mid-broadcast. `hasAppeared` distinguishes that "not yet" case from "never in this
 * match at all" (a roster sized for a full tournament, reused for a small test room), and such
 * never-present teams always sort last regardless of points.
 */
export function computeStandings(input: StandingsInput): Team[] {
  const { players, roster, ruleset, placements } = input;
  const presentTeams = input.presentTeams ?? new Set(roster.map((entry) => entry.teamNo));

  const playersByTeam = new Map<number, IngestPlayer[]>();
  for (const player of players) {
    const bucket = playersByTeam.get(player.teamNo);
    if (bucket) {
      bucket.push(player);
    } else {
      playersByTeam.set(player.teamNo, [player]);
    }
  }

  const unranked = roster.map((entry) => {
    const teamPlayers = (playersByTeam.get(entry.teamNo) ?? [])
      .slice()
      .sort((a, b) => a.slot - b.slot);

    const eliminations = teamPlayers.reduce((total, player) => total + player.kills, 0);
    const standingPlayerCount = teamPlayers.filter(isStanding).length;
    const placement = placements.get(entry.teamNo);

    const killPoints = eliminations * ruleset.pointsPerElimination;
    const placementPoints = placementPointsFor(placement, ruleset);

    return {
      teamNo: entry.teamNo,
      name: entry.name,
      logoUrl: entry.logoUrl,
      players: teamPlayers satisfies Player[],
      standingPlayerCount,
      eliminations,
      killPoints,
      placementPoints,
      totalPoints: killPoints + placementPoints,
      placement: placement ?? null,
      // A team with no reported players has not been wiped out — it has not been seen. Treating
      // "unknown" as "eliminated" would black out the whole table before the first update arrives.
      isEliminated: teamPlayers.length > 0 && standingPlayerCount === 0,
      hasAppeared: presentTeams.has(entry.teamNo),
    };
  });

  // Present teams first, then points, then eliminations, then team number — deterministic, so equal
  // teams never swap places between snapshots and trigger a pointless reorder animation on air. A
  // roster team that never showed up this match must never outrank one that actually played, however
  // few points the real one has earned so far.
  const ranked = unranked.sort(
    (a, b) =>
      Number(b.hasAppeared) - Number(a.hasAppeared) ||
      b.totalPoints - a.totalPoints ||
      b.eliminations - a.eliminations ||
      a.teamNo - b.teamNo,
  );

  return ranked.map((team, index) => ({ ...team, rank: index + 1 }));
}
