import type { TeamRosterEntry } from '@cdf/shared';
import { describe, expect, it } from 'vitest';
import type { IngestPlayer, IngestUpdate } from '../ingest/source.js';
import { MatchStore } from './match-store.js';

function roster(...teamNos: number[]): TeamRosterEntry[] {
  return teamNos.map((teamNo) => ({ teamNo, name: `T${teamNo}`, logoUrl: null }));
}

function player(overrides: Partial<IngestPlayer> & Pick<IngestPlayer, 'teamNo' | 'slot'>): IngestPlayer {
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
});
