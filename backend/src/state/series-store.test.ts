import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ScoringRuleset, TeamRosterEntry } from '@cdf/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IngestPlayer, IngestUpdate } from '../ingest/source.js';
import { MatchStore } from './match-store.js';
import { SeriesStore } from './series-store.js';

const ruleset: ScoringRuleset = {
  schemaVersion: 1,
  id: 'test',
  name: 'Test ruleset',
  pointsPerElimination: 1,
  placementPoints: [10, 6, 5],
};

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

describe('SeriesStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cdf-series-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeStore(stabilityTicks = 2): SeriesStore {
    return new SeriesStore({ dataDir: dir, stabilityTicks });
  }

  it('starts empty, with a fresh series id', async () => {
    const store = makeStore();
    await store.load();

    expect(store.getState().closedMaps).toEqual([]);
    expect(store.getState().seriesId).toBeTruthy();
  });

  it('closeMapNow persists this map only, never the series-cumulative total', async () => {
    const match = new MatchStore({ source: 'pcob', roster: roster(1, 2) });
    // Series context is set, on purpose, to prove the closed record does not capture it — only
    // MatchStore.project()'s own total does. Persisting that would double-count on every future map.
    match.setSeriesContext(new Map([[1, 100]]), new Set());
    match.applyUpdate(
      update({
        players: [
          player({ teamNo: 1, slot: 1, kills: 2, liveState: 'alive' }),
          player({ teamNo: 2, slot: 1, kills: 0, liveState: 'dead' }),
        ],
      }),
    );

    const store = makeStore();
    await store.load();
    const closed = await store.closeMapNow(match.projectAsEnded(), 1_000);

    expect(closed.mapNumber).toBe(1);
    expect(closed.startedAt).toBeNull(); // Never observed via observeMatch, so no start time is known.
    expect(closed.endedAt).toBe(1_000);
    const team1 = closed.teams.find((team) => team.teamNo === 1);
    expect(team1?.placement).toBe(1);
    expect(team1?.eliminations).toBe(2);
    expect(team1?.totalPoints).toBe(12); // killPoints(2) + placementPoints(10) — no +100 from series.

    expect(store.getSeriesTotals().get(1)).toBe(12);
    expect(store.getSeriesHasAppeared().has(1)).toBe(true);
    expect(store.getSeriesHasAppeared().has(2)).toBe(true);
  });

  it('accumulates a team’s points additively across two closed maps', async () => {
    const store = makeStore();
    await store.load();

    const map1 = new MatchStore({ source: 'pcob', roster: roster(1) });
    map1.applyUpdate(
      update({ matchId: 'm1', players: [player({ teamNo: 1, slot: 1, kills: 2 })] }),
    );
    await store.closeMapNow(map1.projectAsEnded(), 1_000);

    const map2 = new MatchStore({ source: 'pcob', roster: roster(1) });
    map2.applyUpdate(
      update({ matchId: 'm2', players: [player({ teamNo: 1, slot: 1, kills: 5 })] }),
    );
    await store.closeMapNow(map2.projectAsEnded(), 2_000);

    expect(store.getState().closedMaps.map((m) => m.mapNumber)).toEqual([1, 2]);
    // Map 1: killPoints(2) + placementPoints(10) = 12. Map 2: killPoints(5) + placementPoints(10) = 15.
    expect(store.getSeriesTotals().get(1)).toBe(27);
  });

  describe('observeMatch', () => {
    // Automatic closing on the `ended` phase was removed live, mid-tournament: `ended` (via
    // `FinishedStartTime`) fired while most of the lobby was still fighting, and every team still
    // alive was immediately handed a full, final placement on air. `observeMatch` now only tracks a
    // match id's stability for `currentMapStartedAt` — a map is recorded only by an explicit
    // `closeMapNow` or `insertManualMap` call, never on its own, whatever the phase reports.

    it('never closes a map on its own, `ended` phase or not', async () => {
      const store = makeStore(2);
      const match = new MatchStore({ source: 'pcob', roster: roster(1) });
      match.applyUpdate(
        update({ phase: 'ended', players: [player({ teamNo: 1, slot: 1, kills: 1 })] }),
      );
      await store.load();

      for (const now of [1_000, 1_100, 1_200, 1_300, 1_400, 1_500]) {
        expect(await store.observeMatch(match.project(), now)).toBeNull();
      }

      expect(store.getState().closedMaps).toEqual([]);
    });

    it('records the moment a match id first became stable as the map’s start time', async () => {
      const store = makeStore(2);
      const match = new MatchStore({ source: 'pcob', roster: roster(1) });
      match.applyUpdate(update({ phase: 'live', players: [player({ teamNo: 1, slot: 1 })] }));

      await store.load();
      await store.observeMatch(match.project(), 1_000); // sighting 1.
      await store.observeMatch(match.project(), 1_100); // stable as of here.

      const closed = await store.closeMapNow(match.projectAsEnded(), 1_500);

      expect(closed.startedAt).toBe(1_100);
    });

    it('a matchId that flaps back and forth never gets treated as stable', async () => {
      const store = makeStore(2);
      await store.load();

      const a = new MatchStore({ source: 'pcob', roster: roster(1) });
      a.applyUpdate(update({ matchId: 'a', players: [player({ teamNo: 1, slot: 1 })] }));
      const b = new MatchStore({ source: 'pcob', roster: roster(1) });
      b.applyUpdate(update({ matchId: 'b', players: [player({ teamNo: 1, slot: 1 })] }));

      await store.observeMatch(a.project(), 1_000);
      await store.observeMatch(b.project(), 1_100); // flap to a different id resets the candidate.
      await store.observeMatch(a.project(), 1_200); // back to "a", but stability restarts from here.

      const closed = await store.closeMapNow(a.projectAsEnded(), 1_500);
      // Never became stable within this window, so no start time was ever recorded for it.
      expect(closed.startedAt).toBeNull();
    });
  });

  describe('shouldAutoCloseNow', () => {
    // Reintroduced after `observeMatch`'s removal above, trusting a different signal:
    // `standingTeamCount <= 1`, a fact about the actual player data rather than an upstream field.

    it('requires standingTeamCount <= 1 stable for two consecutive polls before closing', () => {
      const store = makeStore(2);
      const match = new MatchStore({ source: 'pcob', roster: roster(1, 2) });

      match.applyUpdate(
        update({
          players: [
            player({ teamNo: 1, slot: 1, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, liveState: 'dead' }),
          ],
        }),
      );
      expect(store.shouldAutoCloseNow(match.project())).toBe(false); // sighting 1.
      expect(store.shouldAutoCloseNow(match.project())).toBe(true); // stable — close now.
    });

    it('a single glitched poll (briefly down to 1 standing) does not trigger a close', () => {
      // The same protection `observeMatch` applies to a new match id, applied here: an incomplete
      // player list for one poll must not read as the round having ended.
      const store = makeStore(2);
      const match = new MatchStore({ source: 'pcob', roster: roster(1, 2, 3) });

      match.applyUpdate(
        update({
          players: [
            player({ teamNo: 1, slot: 1, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, liveState: 'dead' }),
            player({ teamNo: 3, slot: 1, liveState: 'dead' }),
          ],
        }),
      );
      expect(store.shouldAutoCloseNow(match.project())).toBe(false); // sighting 1.

      match.applyUpdate(
        update({
          players: [
            player({ teamNo: 1, slot: 1, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, liveState: 'alive' }), // recovers.
            player({ teamNo: 3, slot: 1, liveState: 'dead' }),
          ],
        }),
      );
      expect(store.shouldAutoCloseNow(match.project())).toBe(false); // back above 1 — no close.
    });

    it('does not fire from a team wiped on the warmup island once every team has appeared', async () => {
      // No team reads as not-standing during warmup once it has actually appeared (standings.ts).
      const store = makeStore(2);
      const match = new MatchStore({ source: 'pcob', roster: roster(1, 2) });

      match.applyUpdate(
        update({
          inWarmup: true,
          players: [
            player({ teamNo: 1, slot: 1, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, liveState: 'dead' }), // "wiped" on the warmup island.
          ],
        }),
      );

      expect(match.project().match.standingTeamCount).toBe(2); // Not 1 — warmup never eliminates.
      expect(store.shouldAutoCloseNow(match.project())).toBe(false);
      expect(store.shouldAutoCloseNow(match.project())).toBe(false);
    });

    it('CAN read <= 1 early in warmup, before every team has appeared — the caller must gate on isInWarmup() separately', async () => {
      // Regression against a real gap: standingTeamCount counts teams that have *appeared* and are
      // not eliminated. Early in warmup, before every team's players have arrived even once, only
      // a handful may have appeared at all — nothing to do with anyone having won. This method
      // cannot distinguish that from a genuine late-round 1-survivor situation on its own; it is
      // the caller's job (app.ts) to also check `MatchStore.isInWarmup()` before trusting this.
      const store = makeStore(2);
      const match = new MatchStore({ source: 'pcob', roster: roster(1, 2, 3) });

      // Only team 1 has been reported so far — 2 and 3 have not appeared yet, this early in warmup.
      match.applyUpdate(
        update({ inWarmup: true, players: [player({ teamNo: 1, slot: 1, liveState: 'alive' })] }),
      );

      expect(match.project().match.standingTeamCount).toBe(1); // Not because anyone has won.
      expect(store.shouldAutoCloseNow(match.project())).toBe(false); // sighting 1.
      expect(store.shouldAutoCloseNow(match.project())).toBe(true); // stable — this method fires.
      // A caller that skips the `isInWarmup()` check would now record a fabricated result here.
    });

    it('does not fire again once the match has already been closed', async () => {
      const store = makeStore(2);
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1, 2) });
      match.applyUpdate(
        update({
          players: [
            player({ teamNo: 1, slot: 1, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, liveState: 'dead' }),
          ],
        }),
      );

      store.shouldAutoCloseNow(match.project());
      expect(store.shouldAutoCloseNow(match.project())).toBe(true);
      await store.closeMapNow(match.projectAsEnded(), 1_000);

      // Same projection, same standing count — but the history already holds this match.
      expect(store.shouldAutoCloseNow(match.project())).toBe(false);
    });

    it('resets the candidate on a new match id, same as observeMatch does', () => {
      const store = makeStore(2);
      const a = new MatchStore({ source: 'pcob', roster: roster(1) });
      a.applyUpdate(update({ matchId: 'a', players: [player({ teamNo: 1, slot: 1 })] }));
      const b = new MatchStore({ source: 'pcob', roster: roster(1) });
      b.applyUpdate(update({ matchId: 'b', players: [player({ teamNo: 1, slot: 1 })] }));

      expect(store.shouldAutoCloseNow(a.project())).toBe(false); // "a", sighting 1.
      expect(store.shouldAutoCloseNow(b.project())).toBe(false); // flap to "b" resets the candidate.
      expect(store.shouldAutoCloseNow(a.project())).toBe(false); // back to "a", restarts from here.
    });
  });

  describe('resetSeries', () => {
    it('clears history, assigns a new series id, and does not touch MatchStore', async () => {
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1) });
      match.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1 })] }));
      await store.closeMapNow(match.projectAsEnded(), 1_000);

      const before = store.getState().seriesId;
      await store.resetSeries();

      expect(store.getState().closedMaps).toEqual([]);
      expect(store.getState().seriesId).not.toBe(before);
      // The still-running match's own tracking is a MatchStore concern, untouched by resetSeries.
      expect(match.project().match.matchId).toBe('match-1');
    });
  });

  describe('editClosedMap', () => {
    it('recomputes points from the ruleset rather than accepting a direct override', async () => {
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1, 2) });
      match.applyUpdate(
        update({
          players: [
            player({ teamNo: 1, slot: 1, kills: 1, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, kills: 0, liveState: 'dead' }),
          ],
        }),
      );
      const closed = await store.closeMapNow(match.projectAsEnded(), 1_000);

      const updated = await store.editClosedMap(
        closed.id,
        [
          { teamNo: 1, placement: 2, eliminations: 4 },
          { teamNo: 2, placement: 1, eliminations: 0 },
        ],
        ruleset,
      );

      const team1 = updated.closedMaps[0]?.teams.find((team) => team.teamNo === 1);
      expect(team1?.placement).toBe(2);
      expect(team1?.totalPoints).toBe(10); // killPoints(4) + placementPoints[1] (6).
      expect(store.getSeriesTotals().get(1)).toBe(10); // Recomputed fresh, not stacked on the old value.
    });

    it('rejects an edit where two teams share the same placement', async () => {
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1, 2) });
      match.applyUpdate(
        update({
          players: [
            player({ teamNo: 1, slot: 1 }),
            player({ teamNo: 2, slot: 1, liveState: 'dead' }),
          ],
        }),
      );
      const closed = await store.closeMapNow(match.projectAsEnded(), 1_000);

      await expect(
        store.editClosedMap(
          closed.id,
          [
            { teamNo: 1, placement: 1, eliminations: 0 },
            { teamNo: 2, placement: 1, eliminations: 0 }, // Duplicate placement.
          ],
          ruleset,
        ),
      ).rejects.toThrow();
    });

    it('accepts placements that are distinct but not a contiguous 1..N run', async () => {
      // Found by testing this against a real multi-team mock match, not by inspection:
      // `resolvePlacements`'s slot pool is sized by every team ever seen in the match, which can
      // exceed the count of teams that end up recorded on a closed map — so a real map's own
      // placements can legitimately skip numbers (e.g. 1, 2, 5, 6 for 4 recorded teams, because two
      // other seen teams claimed 3 and 4 but never satisfied `hasAppeared` by the time it closed).
      // An earlier version of this validation required a clean 1..N permutation and would have
      // rejected the system's own unmodified output in exactly this shape.
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1, 2) });
      match.applyUpdate(
        update({
          players: [
            player({ teamNo: 1, slot: 1 }),
            player({ teamNo: 2, slot: 1, liveState: 'dead' }),
          ],
        }),
      );
      const closed = await store.closeMapNow(match.projectAsEnded(), 1_000);

      const updated = await store.editClosedMap(
        closed.id,
        [
          { teamNo: 1, placement: 1, eliminations: 0 },
          { teamNo: 2, placement: 5, eliminations: 0 }, // Not 2 — a gap, on purpose.
        ],
        ruleset,
      );

      expect(
        updated.closedMaps[0]?.teams.map((team) => team.placement).sort((a, b) => a - b),
      ).toEqual([1, 5]);
    });

    it('rejects an edit that does not cover exactly the map’s original teams', async () => {
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1) });
      match.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1 })] }));
      const closed = await store.closeMapNow(match.projectAsEnded(), 1_000);

      await expect(
        store.editClosedMap(closed.id, [{ teamNo: 99, placement: 1, eliminations: 0 }], ruleset),
      ).rejects.toThrow();
    });
  });

  describe('deleteClosedMap', () => {
    it('removes a map and renumbers the remaining ones sequentially', async () => {
      const store = makeStore();
      await store.load();

      const closed: string[] = [];
      for (const [matchId, teamNo] of [
        ['m1', 1] as const,
        ['m2', 1] as const,
        ['m3', 1] as const,
      ]) {
        const match = new MatchStore({ source: 'pcob', roster: roster(teamNo) });
        match.applyUpdate(update({ matchId, players: [player({ teamNo, slot: 1 })] }));
        closed.push((await store.closeMapNow(match.projectAsEnded(), 1_000)).id);
      }

      await store.deleteClosedMap(closed[1]!); // delete map 2 of 3.

      expect(store.getState().closedMaps.map((m) => m.mapNumber)).toEqual([1, 2]);
      expect(store.getState().closedMaps.map((m) => m.id)).toEqual([closed[0], closed[2]]);
    });

    it('throws for an unknown map id', async () => {
      const store = makeStore();
      await store.load();

      await expect(store.deleteClosedMap('does-not-exist')).rejects.toThrow();
    });
  });

  describe('getBankedPointsForMatch', () => {
    it('reports what a still-displayed match has already put into the series total', async () => {
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1, 2) });
      match.applyUpdate(
        update({
          matchId: 'm1',
          players: [
            player({ teamNo: 1, slot: 1, kills: 2, liveState: 'alive' }),
            player({ teamNo: 2, slot: 1, liveState: 'dead' }),
          ],
        }),
      );
      await store.closeMapNow(match.projectAsEnded(), 1_000);

      // killPoints(2) + placementPoints(10) for the winner; the wiped team took 2nd for 6.
      expect(store.getBankedPointsForMatch('m1').get(1)).toBe(12);
      expect(store.getBankedPointsForMatch('m1').get(2)).toBe(6);
      // Nothing is banked against a different match, or against no match at all.
      expect(store.getBankedPointsForMatch('m2').size).toBe(0);
      expect(store.getBankedPointsForMatch(null).size).toBe(0);
    });

    it('drops back to nothing once the map it came from is deleted', async () => {
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1) });
      match.applyUpdate(update({ matchId: 'm1', players: [player({ teamNo: 1, slot: 1 })] }));
      const closed = await store.closeMapNow(match.projectAsEnded(), 1_000);

      expect(store.getBankedPointsForMatch('m1').get(1)).toBe(10);
      await store.deleteClosedMap(closed.id);

      // Derived fresh from the history every call, so a deleted map cannot leave the live PTS
      // column netting out points that are no longer counted anywhere.
      expect(store.getBankedPointsForMatch('m1').size).toBe(0);
    });

    it('ignores a hand-added map, which belongs to no match at all', async () => {
      const store = makeStore();
      await store.load();
      await store.insertManualMap(1, [{ teamNo: 1, placement: 1, eliminations: 3 }], ruleset);

      expect(store.getState().closedMaps[0]?.matchId).toBeNull();
      expect(store.getBankedPointsForMatch(null).size).toBe(0);
    });
  });

  describe('refusing a close that would record the same match twice', () => {
    it('refuses a second manual close of the same match', async () => {
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1) });
      match.applyUpdate(update({ matchId: 'm1', players: [player({ teamNo: 1, slot: 1 })] }));

      await store.closeMapNow(match.projectAsEnded(), 1_000);

      // The projection counts from the match's own start, so closing again would bank its points a
      // second time. Adding a map by hand is the supported way to record an extra entry.
      await expect(store.closeMapNow(match.projectAsEnded(), 2_000)).rejects.toThrow(
        /already been closed/,
      );
      expect(store.getState().closedMaps).toHaveLength(1);
    });

    it('refuses the second of two closes fired without awaiting the first — the actual race', async () => {
      // Regression: this is the shape a real auto-close race takes — two ticks a poll apart, the
      // second fired before the first's write has landed, both reading the same "not yet closed"
      // snapshot. Without serializing the whole read-then-write body (not just the write itself),
      // both would pass the `hasClosedMapFor` guard and both persist, the second silently
      // overwriting the first on disk.
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1) });
      match.applyUpdate(update({ matchId: 'm1', players: [player({ teamNo: 1, slot: 1 })] }));

      const projection = match.projectAsEnded();
      const first = store.closeMapNow(projection, 1_000);
      const second = store.closeMapNow(projection, 1_000); // No await between them.

      await expect(first).resolves.toBeTruthy();
      await expect(second).rejects.toThrow(/already been closed/);
      expect(store.getState().closedMaps).toHaveLength(1);
    });

    it('refuses a close when no match is running, rather than recording an empty map', async () => {
      const store = makeStore();
      await store.load();
      const match = new MatchStore({ source: 'pcob', roster: roster(1) });

      await expect(store.closeMapNow(match.projectAsEnded(), 1_000)).rejects.toThrow(
        /no match running/,
      );
      expect(store.getState().closedMaps).toEqual([]);
    });

    it('refuses a manual close of the same match again after a restart', async () => {
      // The persisted guard (`hasClosedMapFor`), not the in-memory `lastClosedMatchId` this replaced
      // — that field only ever protected the auto-close path, which no longer exists. A restart
      // loses all in-memory state, but the operator clicking "Close current map now" a second time
      // for a match already in the history must still be refused: the projection reports the
      // match's points cumulatively from its own start, so a second record would repeat everything
      // the first one already banked.
      const match = new MatchStore({ source: 'pcob', roster: roster(1) });
      match.applyUpdate(update({ matchId: 'm1', players: [player({ teamNo: 1, slot: 1 })] }));

      const before = makeStore();
      await before.load();
      await before.closeMapNow(match.projectAsEnded(), 1_000);
      expect(before.getState().closedMaps).toHaveLength(1);

      const after = makeStore(); // Same data directory: a restarted backend, no in-memory state.
      await after.load();

      await expect(after.closeMapNow(match.projectAsEnded(), 2_000)).rejects.toThrow(
        /already been closed/,
      );
      expect(after.getState().closedMaps).toHaveLength(1);
    });
  });

  describe('insertManualMap', () => {
    async function seeded(): Promise<SeriesStore> {
      const store = makeStore();
      await store.load();
      for (const teamNo of [1, 2, 3]) {
        await store.insertManualMap(
          99, // Past the end, so each one appends.
          [{ teamNo: 1, placement: teamNo, eliminations: 0 }],
          ruleset,
        );
      }
      return store;
    }

    it('appends when the position is at or past the end, and renumbers', async () => {
      const store = await seeded();

      expect(store.getState().closedMaps.map((map) => map.mapNumber)).toEqual([1, 2, 3]);
    });

    it('inserts between two existing maps and renumbers everything after it', async () => {
      const store = await seeded();
      const before = store.getState().closedMaps.map((map) => map.id);

      const added = await store.insertManualMap(
        3, // Between the current maps 2 and 3.
        [{ teamNo: 1, placement: 1, eliminations: 4 }],
        ruleset,
      );

      const after = store.getState().closedMaps;
      expect(added.mapNumber).toBe(3);
      expect(after.map((map) => map.mapNumber)).toEqual([1, 2, 3, 4]);
      expect(after.map((map) => map.id)).toEqual([before[0], before[1], added.id, before[2]]);
    });

    it('inserts at the very front', async () => {
      const store = await seeded();
      const before = store.getState().closedMaps.map((map) => map.id);

      const added = await store.insertManualMap(
        1,
        [{ teamNo: 1, placement: 1, eliminations: 0 }],
        ruleset,
      );

      expect(added.mapNumber).toBe(1);
      expect(store.getState().closedMaps.map((map) => map.id)).toEqual([added.id, ...before]);
    });

    it('derives points from the ruleset and records no match or clock', async () => {
      const store = makeStore();
      await store.load();

      const added = await store.insertManualMap(
        1,
        [
          { teamNo: 1, placement: 1, eliminations: 4 },
          { teamNo: 2, placement: 2, eliminations: 1 },
        ],
        ruleset,
      );

      // Ruleset: 1 point per elimination, placementPoints [10, 6, 5].
      expect(added.teams.find((team) => team.teamNo === 1)?.totalPoints).toBe(14);
      expect(added.teams.find((team) => team.teamNo === 2)?.totalPoints).toBe(7);
      expect(added.matchId).toBeNull();
      expect(added.startedAt).toBeNull();
      // Not "now": a map inserted at position 1 would then read as later than the maps after it.
      expect(added.endedAt).toBeNull();
    });

    it('counts towards the series totals exactly like a played map', async () => {
      const store = makeStore();
      await store.load();
      await store.insertManualMap(1, [{ teamNo: 5, placement: 1, eliminations: 3 }], ruleset);

      expect(store.getSeriesTotals().get(5)).toBe(13);
      expect(store.getSeriesHasAppeared().has(5)).toBe(true);
    });

    it('rejects duplicate placements, duplicate teams, and an empty result', async () => {
      const store = makeStore();
      await store.load();

      await expect(
        store.insertManualMap(
          1,
          [
            { teamNo: 1, placement: 1, eliminations: 0 },
            { teamNo: 2, placement: 1, eliminations: 0 },
          ],
          ruleset,
        ),
      ).rejects.toThrow(/same placement/);

      await expect(
        store.insertManualMap(
          1,
          [
            { teamNo: 1, placement: 1, eliminations: 0 },
            { teamNo: 1, placement: 2, eliminations: 0 },
          ],
          ruleset,
        ),
      ).rejects.toThrow(/twice in one map/);

      await expect(store.insertManualMap(1, [], ruleset)).rejects.toThrow(/at least one team/);
      expect(store.getState().closedMaps).toEqual([]);
    });
  });
});
