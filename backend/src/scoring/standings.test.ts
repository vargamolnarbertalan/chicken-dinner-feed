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

  it('breaks ties by eliminations, then by team number, so equal teams never swap places', () => {
    // A non-deterministic tie-break would reorder rows between identical snapshots and trigger
    // reorder animations on air for no reason.
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

  it('marks a team present when presentTeams is given and it is not in the set', () => {
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
});
