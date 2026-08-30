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

  describe('banked points from a map closed out of this same match', () => {
    it('stops re-adding a just-closed match’s own points once the series total already includes them', () => {
      // Regression: found live. A map auto-closes, its points get banked into the series total, but
      // MatchStore keeps showing that same match's data (frozen) until the next match's first
      // update — without netting, that frozen window double-counted the closing map's points.
      const store = new MatchStore({ source: 'pcob', roster: roster(1) });
      store.applyUpdate(
        update({ players: [player({ teamNo: 1, slot: 1, kills: 8 })], phase: 'ended' }),
      );

      const beforeClose = store.project().match.teams[0];
      expect(beforeClose?.totalPoints).toBe(18); // killPoints(8) + placementPoints[0] (10).

      // The series total now includes this same match's 18 points, as it would right after close.
      store.setSeriesContext(
        new Map([[1, 18]]),
        new Set([1]),
        new Map([[1, { killPoints: 8, placementPoints: 10 }]]),
      );

      expect(store.project().match.teams[0]?.totalPoints).toBe(18); // Unchanged — not 36.
    });

    it('keeps counting eliminations scored after the close, instead of freezing the column', () => {
      // Regression: closing a map while the game was still running froze PTS for the rest of that
      // match. Reported after colleagues faked a few maps of history and then found that a fresh
      // kill moved nothing at all.
      const store = new MatchStore({ source: 'pcob', roster: roster(1) });
      store.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1, kills: 8 })] }));
      store.setSeriesContext(
        new Map([[1, 18]]),
        new Set([1]),
        new Map([[1, { killPoints: 8, placementPoints: 10 }]]),
      );
      expect(store.project().match.teams[0]?.totalPoints).toBe(18);

      // Same match, same id — the game did not restart, a player just got two more kills.
      store.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1, kills: 10 })] }));

      // 10 kills + guaranteed-minimum 10 = 20 earned, 18 already banked → 2 new points on top.
      expect(store.project().match.teams[0]?.totalPoints).toBe(20);
    });

    it('counts a genuinely new match in full, once nothing is banked against it', () => {
      const store = new MatchStore({ source: 'pcob', roster: roster(1) });
      store.applyUpdate(
        update({ players: [player({ teamNo: 1, slot: 1, kills: 8 })], phase: 'ended' }),
      );
      store.setSeriesContext(
        new Map([[1, 18]]),
        new Set([1]),
        new Map([[1, { killPoints: 8, placementPoints: 10 }]]),
      );

      store.applyUpdate(
        update({ matchId: 'match-2', players: [player({ teamNo: 1, slot: 1, kills: 3 })] }),
      );
      // Nothing is banked against match-2 — this is what the caller re-derives per update.
      store.setSeriesContext(new Map([[1, 18]]), new Set([1]), new Map());

      // 3 kill points + the guaranteed-minimum for the only team standing (10) + 18 series.
      expect(store.project().match.teams[0]?.totalPoints).toBe(31);
    });

    it('records no elimination during warmup, and none of it sticks afterwards', () => {
      // A team wiped on the warmup island has not been eliminated from anything. `eliminationOrder`
      // is append-only, so recording one there would hand that team a last-place finish for the
      // whole round that follows — irreversible short of restarting the app.
      const store = new MatchStore({ source: 'pcob', roster: roster(1, 2) });

      store.applyUpdate(
        update({
          inWarmup: true,
          players: [
            player({ teamNo: 1, slot: 1, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, liveState: 'dead' }), // "wiped" in warmup.
          ],
        }),
      );

      const warmup = store.project();
      expect(warmup.match.teams.every((team) => team.placement === null)).toBe(true);
      // Both teams still render normally — the leaderboard is useful on air during warmup.
      expect(warmup.match.teams.every((team) => team.hasAppeared)).toBe(true);
      // And neither greys out: they respawn on the island, so a wipe there is not a wipe. The
      // count a director reads off a Stream Deck button must not drop and climb back with the
      // warmup scuffle either.
      expect(warmup.match.teams.every((team) => !team.isEliminated)).toBe(true);
      expect(warmup.match.standingTeamCount).toBe(2);

      // The round starts and team 2 is alive again, as it would be after the real drop.
      store.applyUpdate(
        update({
          players: [
            player({ teamNo: 1, slot: 1, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, liveState: 'alive' }),
          ],
        }),
      );

      const live = store.project();
      expect(live.match.teams.every((team) => team.placement === null)).toBe(true);
      expect(live.match.standingTeamCount).toBe(2);
    });

    it('reports the match it is showing, so the caller can look up what is banked for it', () => {
      const store = new MatchStore({ source: 'pcob', roster: roster(1) });
      expect(store.currentMatchId()).toBeNull();

      store.applyUpdate(update({ matchId: 'match-7', players: [player({ teamNo: 1, slot: 1 })] }));

      expect(store.currentMatchId()).toBe('match-7');
    });
  });
});
