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
  /**
   * Points already banked in previous, closed maps of the series (specs/SCORING-LOGIC-UPDATE.md).
   * Added on top of this map's own kill/placement points. Optional and defaults to nothing, so every
   * existing caller — single-match tests included — keeps computing this-match-only points.
   */
  seriesPointsByTeam?: ReadonlyMap<number, number>;
  /**
   * Team numbers that have appeared in some *previous* map of the series, even if not in this one
   * (a bye, or data lagging at the very start of a new map). Used only to break the "never appeared"
   * sort tie correctly across a series — it does not change the `hasAppeared` field itself, which
   * stays this-match-only because the overlay's grey-out relies on that exact meaning.
   */
  seriesHasAppeared?: ReadonlySet<number>;
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

/**
 * A confirmed final placement scores its own row in the table; a placement that is not yet known
 * scores the **guaranteed-minimum** row instead — the worst position any currently-alive team could
 * still end up in, given how many teams remain (specs/SCORING-LOGIC-UPDATE.md). If 9 teams started
 * and one has been eliminated, none of the 8 survivors can finish worse than 8th, so all 8 are
 * credited with 8th-place points already, on top of whatever they bank later for their real,
 * eventual placement. Positions past the end of the table score nothing either way, so a short table
 * means "only the top N score" for both a real and a guaranteed-minimum placement.
 */
function placementPointsFor(placement: number | undefined, ruleset: ScoringRuleset): number {
  if (placement === undefined) return 0;
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
  const seriesPointsByTeam = input.seriesPointsByTeam;
  const seriesHasAppeared = input.seriesHasAppeared;

  const playersByTeam = new Map<number, IngestPlayer[]>();
  for (const player of players) {
    const bucket = playersByTeam.get(player.teamNo);
    if (bucket) {
      bucket.push(player);
    } else {
      playersByTeam.set(player.teamNo, [player]);
    }
  }

  const base = roster.map((entry) => {
    const teamPlayers = (playersByTeam.get(entry.teamNo) ?? [])
      .slice()
      .sort((a, b) => a.slot - b.slot);

    const eliminations = teamPlayers.reduce((total, player) => total + player.kills, 0);
    const standingPlayerCount = teamPlayers.filter(isStanding).length;
    const placement = placements.get(entry.teamNo);
    const hasAppeared = presentTeams.has(entry.teamNo);

    return {
      teamNo: entry.teamNo,
      name: entry.name,
      logoUrl: entry.logoUrl,
      players: teamPlayers satisfies Player[],
      standingPlayerCount,
      eliminations,
      placement,
      // A team with no reported players has not been wiped out — it has not been seen. Treating
      // "unknown" as "eliminated" would black out the whole table before the first update arrives.
      isEliminated: teamPlayers.length > 0 && standingPlayerCount === 0,
      hasAppeared,
    };
  });

  // How many currently-alive, present teams share the guaranteed-minimum placement described on
  // `placementPointsFor`. A team that has not appeared at all cannot be "guaranteed" anything.
  const standingCount = base.filter(
    (team) => team.hasAppeared && team.placement === undefined,
  ).length;

  const unranked = base.map((team) => {
    const killPoints = team.eliminations * ruleset.pointsPerElimination;
    const placementPoints =
      team.placement !== undefined
        ? placementPointsFor(team.placement, ruleset)
        : team.hasAppeared
          ? placementPointsFor(standingCount, ruleset)
          : 0;
    const seriesPoints = seriesPointsByTeam?.get(team.teamNo) ?? 0;

    return {
      ...team,
      killPoints,
      placementPoints,
      totalPoints: killPoints + placementPoints + seriesPoints,
      placement: team.placement ?? null,
    };
  });

  // Present teams first (this match, or anywhere earlier in the series), then points, then this
  // map's eliminations, then team name — deterministic, so equal teams never swap places between
  // snapshots and trigger a pointless reorder animation on air. A roster team that has never
  // appeared, in this map or any earlier one in the series, must never outrank one that actually
  // played, however few points the real one has earned so far.
  const ranked = unranked.sort((a, b) => {
    const aAppeared = a.hasAppeared || (seriesHasAppeared?.has(a.teamNo) ?? false);
    const bAppeared = b.hasAppeared || (seriesHasAppeared?.has(b.teamNo) ?? false);
    return (
      Number(bAppeared) - Number(aAppeared) ||
      b.totalPoints - a.totalPoints ||
      b.eliminations - a.eliminations ||
      a.name.localeCompare(b.name)
    );
  });

  return ranked.map((team, index) => ({ ...team, rank: index + 1 }));
}
