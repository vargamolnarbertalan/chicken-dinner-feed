import type { TeamRosterEntry } from '@cdf/shared';
import { describe, expect, it } from 'vitest';
import type { IngestPlayer, IngestUpdate } from '../ingest/source.js';
import { MatchStore } from './match-store.js';

function roster(...teamNos: number[]): TeamRosterEntry[] {
  return teamNos.map((teamNo) => ({ teamNo, name: `T${teamNo}`, logoUrl: null }));
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

function update(overrides: Partial<IngestUpdate> = {}): IngestUpdate {
  return { matchId: 'match-1', phase: 'live', players: [], ...overrides };
}

describe('MatchStore', () => {
  it(
    'a real match, using only a fraction of a full tournament roster, ranks the team the API ' +
      'placed second above teams that were never in the lobby at all',
    () => {
      // The exact bug from a live 1v1 test tonight: two real teams (4 and 16) played out of a
      // 16-team roster. The loser's own API `rank: 2` must win over our elimination-order fallback,
      // which — sized off the full roster — would otherwise put them in 16th place.
      const store = new MatchStore({ source: 'pcob', roster: roster(4, 16) });

      store.applyUpdate(
        update({
          phase: 'ended',
          players: [
            player({ teamNo: 16, slot: 1, kills: 1, liveState: 'alive', rank: 1 }),
            player({ teamNo: 4, slot: 1, kills: 0, liveState: 'dead', rank: 2 }),
          ],
        }),
      );

      const { match } = store.project();
      const byTeam = new Map(match.teams.map((team) => [team.teamNo, team]));

      expect(byTeam.get(16)?.placement).toBe(1);
      expect(byTeam.get(4)?.placement).toBe(2);
    },
  );

  it('never counts a roster team that has not appeared this match toward the elimination-order fallback total', () => {
    // Same shape, but without the API ever reporting a rank — forces the fallback path. Sizing it
    // off seenTeams (2) rather than the full roster (16) is what keeps a real elimination sane.
    const store = new MatchStore({ source: 'pcob', roster: roster(4, 16) });

    store.applyUpdate(
      update({
        players: [
          player({ teamNo: 16, slot: 1, kills: 0, liveState: 'alive' }),
          player({ teamNo: 4, slot: 1, kills: 0, liveState: 'dead' }),
        ],
      }),
    );

    const { match } = store.project();
    const eliminated = match.teams.find((team) => team.teamNo === 4);

    // 2 teams seen, team 4 went out first (index 0): placement = 2 - 0 = 2, not 16 - 0 = 16.
    expect(eliminated?.placement).toBe(2);
  });

  it('marks roster teams that never appeared this match as not present, and ranks them last', () => {
    const store = new MatchStore({ source: 'pcob', roster: roster(1, 2, 3) });

    store.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1, kills: 3 })] }));

    const { match } = store.project();

    expect(match.teams.map((team) => team.teamNo)).toEqual([1, 2, 3]);
    expect(match.teams[0]?.hasAppeared).toBe(true);
    expect(match.teams[1]?.hasAppeared).toBe(false);
    expect(match.teams[2]?.hasAppeared).toBe(false);
  });

  it('never gives two teams the same placement when a survivor has no API rank yet but another team already does', () => {
    // The API can answer for one team before another (specs/PCOB-API.md §4: "a single response can
    // mix generations"). Old code numbered survivors 1, 2, 3... regardless of what the API had
    // already claimed, so a winner reporting `rank: 1` and a teammate-less survivor still waiting
    // for its own rank could both end up placement 1.
    const store = new MatchStore({ source: 'pcob', roster: roster(1, 2) });

    store.applyUpdate(
      update({
        phase: 'ended',
        players: [
          player({ teamNo: 1, slot: 1, liveState: 'alive', rank: 1 }), // API already confirmed 1st.
          player({ teamNo: 2, slot: 1, liveState: 'alive', rank: 0 }), // Still standing, no rank yet.
        ],
      }),
    );

    const { match } = store.project();
    const placements = match.teams.map((team) => team.placement).filter((p) => p !== null);

    expect(new Set(placements).size).toBe(placements.length); // No two teams share a placement.
    expect(match.teams.find((t) => t.teamNo === 1)?.placement).toBe(1);
    expect(match.teams.find((t) => t.teamNo === 2)?.placement).toBe(2);
  });

  it('never gives two teams the same placement when an eliminated team is later confirmed by the API out of elimination order', () => {
    // Our own elimination-order fallback and the API's `rank` are two independent guesses that can
    // legitimately disagree about *when* — old code let the fallback's arithmetic land on a number
    // the API had already handed to someone else.
    const store = new MatchStore({ source: 'pcob', roster: roster(10, 11, 12) });

    // Poll 1: team 12 goes out first. No rank known yet for anyone.
    store.applyUpdate(
      update({
        players: [
          player({ teamNo: 10, slot: 1, liveState: 'alive' }),
          player({ teamNo: 11, slot: 1, liveState: 'alive' }),
          player({ teamNo: 12, slot: 1, liveState: 'dead' }),
        ],
      }),
    );

    // Poll 2: team 11 goes out too. Team 12's API rank has now arrived: 2nd place.
    store.applyUpdate(
      update({
        phase: 'ended',
        players: [
          player({ teamNo: 10, slot: 1, liveState: 'alive' }),
          player({ teamNo: 11, slot: 1, liveState: 'dead' }),
          player({ teamNo: 12, slot: 1, liveState: 'dead', rank: 2 }),
        ],
      }),
    );

    const { match } = store.project();
    const placements = match.teams.map((team) => team.placement).filter((p) => p !== null);

    expect(new Set(placements).size).toBe(placements.length); // No two teams share a placement.
    expect(match.teams.find((t) => t.teamNo === 12)?.placement).toBe(2);
  });

  it('resets which teams have appeared when a new match starts', () => {
    const store = new MatchStore({ source: 'pcob', roster: roster(1, 2) });

    store.applyUpdate(update({ matchId: 'match-1', players: [player({ teamNo: 1, slot: 1 })] }));
    store.applyUpdate(update({ matchId: 'match-2', players: [player({ teamNo: 2, slot: 1 })] }));

    const { match } = store.project();
    const byTeam = new Map(match.teams.map((team) => [team.teamNo, team]));

    expect(byTeam.get(2)?.hasAppeared).toBe(true);
    // Team 1 appeared last match, not this one.
    expect(byTeam.get(1)?.hasAppeared).toBe(false);
  });

  describe('projectAsEnded', () => {
    it('gives every still-alive team a real, final placement instead of a guaranteed-minimum', () => {
      // A manual "close this map now" needs the same survivor-assignment `resolvePlacements` already
      // does for a real `ended` transition — reused rather than duplicated.
      const store = new MatchStore({ source: 'pcob', roster: roster(1, 2, 3) });

      store.applyUpdate(
        update({
          players: [
            player({ teamNo: 1, slot: 1, kills: 3, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, kills: 1, liveState: 'alive' }),
            player({ teamNo: 3, slot: 1, kills: 0, liveState: 'dead' }),
          ],
        }),
      );

      const { match } = store.projectAsEnded();
      const placements = match.teams.map((team) => team.placement).filter((p) => p !== null);

      expect(match.phase).toBe('ended');
      expect(new Set(placements).size).toBe(3); // Every team gets a distinct, real placement.
      // The two survivors are ranked by kills for the slots the API/elimination order left open.
      expect(match.teams.find((t) => t.teamNo === 1)?.placement).toBe(1);
      expect(match.teams.find((t) => t.teamNo === 2)?.placement).toBe(2);
    });

    it('does not mutate the store’s own tracked phase or connection state', () => {
      const store = new MatchStore({ source: 'pcob', roster: roster(1) });
      store.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1 })] }));

      store.projectAsEnded();

      // A real, later update for the same still-live match must not have been affected.
      expect(store.project().match.phase).toBe('live');
    });
  });

  describe('setSeriesContext', () => {
    it('adds series points on top of this match and keeps a never-appeared team last', () => {
      const store = new MatchStore({ source: 'pcob', roster: roster(1, 2) });
      store.setSeriesContext(new Map([[1, 25]]), new Set());

      store.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1, kills: 1 })] }));

      const { match } = store.project();
      const byTeam = new Map(match.teams.map((team) => [team.teamNo, team]));

      // Default ruleset: 1 kill point + guaranteed-minimum for the 1 team standing (10) + 25 series.
      expect(byTeam.get(1)?.totalPoints).toBe(36);
      expect(match.teams[0]?.teamNo).toBe(1); // Team 2 never appeared, still sorts last.
    });

    it('defaults to no series context, adding nothing beyond this match on its own', () => {
      const store = new MatchStore({ source: 'pcob', roster: roster(1) });
      store.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1, kills: 2 })] }));

      const { match } = store.project();

      // 2 kill points + the guaranteed-minimum for the only team standing (10) + 0 series (unset).
      expect(match.teams[0]?.totalPoints).toBe(12);
    });
  });
});
