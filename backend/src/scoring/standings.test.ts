import type { ScoringRuleset, TeamRosterEntry } from '@cdf/shared';
import { describe, expect, it } from 'vitest';
import type { IngestPlayer } from '../ingest/source.js';
import { computeStandings } from './standings.js';

const ruleset: ScoringRuleset = {
  schemaVersion: 1,
  id: 'test',
  name: 'Test ruleset',
  pointsPerElimination: 1,
  placementPoints: [10, 6, 5],
};

function roster(...teamNos: number[]): TeamRosterEntry[] {
  return teamNos.map((teamNo) => ({
    teamNo,
    name: `T${teamNo}`,
    logoUrl: null,
  }));
}

function player(
  overrides: Partial<IngestPlayer> & Pick<IngestPlayer, 'teamNo' | 'slot'>,
): IngestPlayer {
  return {
    id: `p${overrides.teamNo}-${overrides.slot}`,
    name: `Player ${overrides.teamNo}-${overrides.slot}`,
    liveState: 'alive',
    health: 100,
    healthMax: 100,
    kills: 0,
    rank: 0,
    ...overrides,
  };
}

describe('computeStandings', () => {
  it('ranks by total points, highest first', () => {
    const teams = computeStandings({
      players: [
        player({ teamNo: 1, slot: 1, kills: 2 }),
        player({ teamNo: 2, slot: 1, kills: 5 }),
        player({ teamNo: 3, slot: 1, kills: 3 }),
      ],
      roster: roster(1, 2, 3),
      ruleset,
      placements: new Map(),
    });

    expect(teams.map((team) => team.teamNo)).toEqual([2, 3, 1]);
    expect(teams.map((team) => team.rank)).toEqual([1, 2, 3]);
  });

  it('sums eliminations across the team and converts them at the configured rate', () => {
    const [team] = computeStandings({
      players: [player({ teamNo: 1, slot: 1, kills: 2 }), player({ teamNo: 1, slot: 2, kills: 3 })],
      roster: roster(1),
      ruleset: { ...ruleset, pointsPerElimination: 2 },
      placements: new Map(),
    });

    expect(team?.eliminations).toBe(5);
    expect(team?.killPoints).toBe(10);
    expect(team?.totalPoints).toBe(10);
  });

  it('awards no placement points while the team is still in the match', () => {
    const [team] = computeStandings({
      players: [player({ teamNo: 1, slot: 1, kills: 1 })],
      roster: roster(1),
      ruleset,
      placements: new Map(),
    });

    expect(team?.placement).toBeNull();
    expect(team?.placementPoints).toBe(0);
    expect(team?.totalPoints).toBe(1);
  });

  it('awards placement points once the placement is known', () => {
    const [team] = computeStandings({
      players: [player({ teamNo: 1, slot: 1, kills: 1 })],
      roster: roster(1),
      ruleset,
      placements: new Map([[1, 1]]),
    });

    expect(team?.placement).toBe(1);
    expect(team?.placementPoints).toBe(10);
    expect(team?.totalPoints).toBe(11);
  });

  it('scores zero for placements past the end of the table', () => {
    const [team] = computeStandings({
      players: [player({ teamNo: 1, slot: 1 })],
      roster: roster(1),
      ruleset,
      placements: new Map([[1, 9]]),
    });

    expect(team?.placementPoints).toBe(0);
  });

  it('counts knocked players as still standing', () => {
    const [team] = computeStandings({
      players: [
        player({ teamNo: 1, slot: 1, liveState: 'knocked', health: 0 }),
        player({ teamNo: 1, slot: 2, liveState: 'dead', health: 0 }),
      ],
      roster: roster(1),
      ruleset,
      placements: new Map(),
    });

    expect(team?.standingPlayerCount).toBe(1);
    expect(team?.isEliminated).toBe(false);
  });

  it('marks a team eliminated only when every reported player is dead', () => {
    const [team] = computeStandings({
      players: [
        player({ teamNo: 1, slot: 1, liveState: 'dead', health: 0 }),
        player({ teamNo: 1, slot: 2, liveState: 'dead', health: 0 }),
      ],
      roster: roster(1),
      ruleset,
      placements: new Map(),
    });

    expect(team?.standingPlayerCount).toBe(0);
    expect(team?.isEliminated).toBe(true);
  });

  it('does not treat a team with no reported players as eliminated', () => {
    // Before the first update arrives every team is unknown. Rendering them all as wiped out would
    // black out the entire table on air.
    const [team] = computeStandings({
      players: [],
      roster: roster(1),
      ruleset,
      placements: new Map(),
    });

    expect(team?.isEliminated).toBe(false);
    expect(team?.standingPlayerCount).toBe(0);
    expect(team?.players).toEqual([]);
  });

  it('keeps every roster team in the table even when the ingest reports none of its players', () => {
    const teams = computeStandings({
      players: [player({ teamNo: 2, slot: 1, kills: 1 })],
      roster: roster(1, 2, 3),
      ruleset,
      placements: new Map(),
    });

    expect(teams).toHaveLength(3);
    expect(teams.map((team) => team.teamNo).sort()).toEqual([1, 2, 3]);
  });

  it('breaks ties by eliminations, then by team name, so equal teams never swap places', () => {
    // A non-deterministic tie-break would reorder rows between identical snapshots and trigger
    // reorder animations on air for no reason. T1/T2/T3 happen to sort the same way alphabetically
    // as by team number, so this alone would not catch a regression to number-based sorting — see
    // the next test for that.
    const teams = computeStandings({
      players: [
        player({ teamNo: 3, slot: 1, kills: 1 }),
        player({ teamNo: 1, slot: 1, kills: 1 }),
        player({ teamNo: 2, slot: 1, kills: 1 }),
      ],
      roster: roster(1, 2, 3),
      ruleset,
      placements: new Map(),
    });

    expect(teams.map((team) => team.teamNo)).toEqual([1, 2, 3]);
  });

  it('breaks a final tie alphabetically by name, even when that disagrees with team number order', () => {
    const teams = computeStandings({
      players: [],
      roster: [
        { teamNo: 1, name: 'Zebra', logoUrl: null },
        { teamNo: 2, name: 'Alpha', logoUrl: null },
      ],
      ruleset,
      placements: new Map(),
    });

    expect(teams.map((team) => team.name)).toEqual(['Alpha', 'Zebra']);
  });

  it('orders players within a team by slot, so each player keeps the same bar', () => {
    const [team] = computeStandings({
      players: [
        player({ teamNo: 1, slot: 3 }),
        player({ teamNo: 1, slot: 1 }),
        player({ teamNo: 1, slot: 4 }),
        player({ teamNo: 1, slot: 2 }),
      ],
      roster: roster(1),
      ruleset,
      placements: new Map(),
    });

    expect(team?.players.map((p) => p.slot)).toEqual([1, 2, 3, 4]);
  });

  it('marks a team absent when presentTeams is given and it is not in the set', () => {
    const [team] = computeStandings({
      players: [],
      roster: roster(1),
      ruleset,
      placements: new Map(),
      presentTeams: new Set(),
    });

    expect(team?.hasAppeared).toBe(false);
  });

  it('defaults every roster team to present when presentTeams is not given', () => {
    // Preserves old behaviour for callers (mostly other tests) that do not care about presence.
    const [team] = computeStandings({
      players: [],
      roster: roster(1),
      ruleset,
      placements: new Map(),
    });

    expect(team?.hasAppeared).toBe(true);
  });

  it('ranks a never-present roster team behind every real team, however few points the real team has', () => {
    // The exact bug this guards: a small test lobby using 2 of a 16-team roster must not let the
    // other 14, never-joined teams outrank the real, placed team just because it is tied on points.
    const teams = computeStandings({
      players: [player({ teamNo: 1, slot: 1 })], // 0 kills, not placed — 0 points, same as the ghost.
      roster: roster(1, 2),
      ruleset,
      placements: new Map(),
      presentTeams: new Set([1]),
    });

    expect(teams.map((team) => team.teamNo)).toEqual([1, 2]);
    expect(teams[0]?.hasAppeared).toBe(true);
    expect(teams[1]?.hasAppeared).toBe(false);
  });

  describe('multi-map series scoring (specs/SCORING-LOGIC-UPDATE.md)', () => {
    const pubgmRuleset: ScoringRuleset = {
      schemaVersion: 1,
      id: 'pubgm',
      name: 'PUBGM standard',
      pointsPerElimination: 1,
      placementPoints: [10, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    };

    it('credits every still-alive team the guaranteed-minimum placement for 8 survivors out of 9', () => {
      // The spec's own example: 9 teams started, 1 has been eliminated (placed 9th), so none of the
      // remaining 8 can finish worse than 8th — all 8 are credited that now, on top of kills.
      const teamNos = Array.from({ length: 9 }, (_, i) => i + 1);
      const teams = computeStandings({
        players: teamNos.map((teamNo) => player({ teamNo, slot: 1 })),
        roster: roster(...teamNos),
        ruleset: pubgmRuleset,
        placements: new Map([[9, 9]]), // team 9 is the only one eliminated so far.
      });

      const survivors = teams.filter((team) => team.teamNo !== 9);
      expect(survivors).toHaveLength(8);
      for (const team of survivors) {
        expect(team.placement).toBeNull();
        expect(team.placementPoints).toBe(1); // placementPoints[8 - 1]
      }
      expect(teams.find((team) => team.teamNo === 9)?.placementPoints).toBe(0); // 9th scores nothing.
    });

    it('credits both remaining teams the 2nd-place guarantee once only 2 are left alive', () => {
      const teams = computeStandings({
        players: [player({ teamNo: 1, slot: 1 }), player({ teamNo: 2, slot: 1 })],
        roster: roster(1, 2),
        ruleset: pubgmRuleset,
        placements: new Map(),
      });

      expect(teams.every((team) => team.placement === null)).toBe(true);
      expect(teams.every((team) => team.placementPoints === 6)).toBe(true); // placementPoints[2 - 1]
    });

    it('replaces the guaranteed-minimum with the real placement once it is known, never less', () => {
      const [team] = computeStandings({
        players: [player({ teamNo: 1, slot: 1, kills: 3 })],
        roster: roster(1),
        ruleset: pubgmRuleset,
        placements: new Map([[1, 1]]), // finished 1st.
      });

      expect(team?.placementPoints).toBe(10); // the real 1st-place value, not a guaranteed-minimum.
      expect(team?.totalPoints).toBe(13);
    });

    it('adds series points from closed maps on top of this map, recomputed fresh rather than accumulated', () => {
      const [team] = computeStandings({
        players: [player({ teamNo: 1, slot: 1, kills: 2 })],
        roster: roster(1),
        ruleset: pubgmRuleset,
        placements: new Map(),
        seriesPointsByTeam: new Map([[1, 17]]),
      });

      // killPoints (2) + guaranteed-minimum for 1 team standing (placementPoints[0] = 10) + series (17).
      expect(team?.placementPoints).toBe(10);
      expect(team?.totalPoints).toBe(29);
    });

    it('does not credit a guaranteed-minimum to a team that has not appeared in this map at all', () => {
      const teams = computeStandings({
        players: [player({ teamNo: 1, slot: 1 })],
        roster: roster(1, 2),
        ruleset: pubgmRuleset,
        placements: new Map(),
        presentTeams: new Set([1]),
      });

      expect(teams.find((team) => team.teamNo === 2)?.placementPoints).toBe(0);
    });

    it('sorts a team that sat out this map, but appeared earlier in the series, ahead of a true ghost', () => {
      // A bye or a data lag at the very start of a new map must not drop a real, scoring team behind
      // a roster slot that has never once appeared, anywhere in the series.
      const teams = computeStandings({
        players: [],
        roster: roster(1, 2),
        ruleset: pubgmRuleset,
        placements: new Map(),
        presentTeams: new Set(), // neither team has appeared in THIS map yet.
        seriesPointsByTeam: new Map([[1, 12]]),
        seriesHasAppeared: new Set([1]), // team 1 played (and scored) in an earlier map.
      });

      expect(teams.map((team) => team.teamNo)).toEqual([1, 2]);
      // The exposed `hasAppeared` stays this-match-only — the overlay's grey-out depends on that.
      expect(teams[0]?.hasAppeared).toBe(false);
    });

    it('suppressThisMapPoints stops double-counting a just-closed map still frozen on screen', () => {
      // Regression: found live, running the app — a map closing pushed its own points into the
      // series total while MatchStore was still showing that same match's data (frozen, per
      // ADR-0007, until the next map's first update). Without suppression, PTS briefly counted the
      // closing map's points twice, then visibly dropped once the next match actually started.
      const [team] = computeStandings({
        players: [player({ teamNo: 1, slot: 1, kills: 8 })],
        roster: roster(1),
        ruleset: pubgmRuleset,
        placements: new Map([[1, 1]]), // this map's own, now-final placement: 1st.
        seriesPointsByTeam: new Map([[1, 121]]), // already includes this same map's 18 points.
        suppressThisMapPoints: true,
      });

      // killPoints/placementPoints are still computed and returned normally for display...
      expect(team?.killPoints).toBe(8);
      expect(team?.placementPoints).toBe(10);
      // ...but totalPoints only counts the series figure, not a second helping on top of it.
      expect(team?.totalPoints).toBe(121);
    });
  });
});
