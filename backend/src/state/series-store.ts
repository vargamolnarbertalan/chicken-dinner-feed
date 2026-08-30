import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type {
  ClosedMapResult,
  ClosedMapTeamResult,
  ScoringRuleset,
  SeriesDocument,
} from '@cdf/shared';
import { createDefaultSeriesDocument, seriesDocumentSchema } from '@cdf/shared';
import type { Projection } from './match-store.js';
import type { BankedPoints } from '../scoring/standings.js';
import { JsonDocument } from '../persistence/json-document.js';
import { migrateSchemaVersionOnly } from '../persistence/migrations.js';

export interface SeriesStoreOptions {
  dataDir: string;
  onWarn?: (message: string, detail: unknown) => void;
  /**
   * How many consecutive `observeMatch` calls a signal must hold before it is trusted — both a new
   * match id and the `ended` phase. Guards against exactly the gap `specs/PCOB-API.md` §7.6
   * documents as still open: "a `GameID` that flaps... must not reset anything. Require the new id
   * to be stable across a couple of polls before acting on it." Defaults to 2, i.e. one real poll of
   * confirmation beyond the first sighting.
   */
  stabilityTicks?: number;
}

const DEFAULT_STABILITY_TICKS = 2;

/** A team result accepted for a closed map: the raw inputs, never a direct points override. */
export interface ClosedMapTeamEdit {
  teamNo: number;
  placement: number;
  eliminations: number;
}

/**
 * Points are always re-derived from the ruleset, never accepted as an override — the same rule that
 * governs live scoring. Shared by correcting an existing map and adding one by hand, so the two can
 * never drift into scoring the same inputs differently.
 */
function resultsFromEdits(
  edits: readonly ClosedMapTeamEdit[],
  ruleset: ScoringRuleset,
): ClosedMapTeamResult[] {
  // Distinct, not necessarily a contiguous 1..N run: a real closed map's own placements can
  // legitimately skip numbers — `resolvePlacements`'s slot pool is sized by every team ever seen in
  // the match, which can exceed the count of teams that end up recorded here. Requiring a clean
  // 1..N permutation would reject the system's own unmodified output (found by testing this against
  // a real multi-team mock match, not by inspection).
  const placements = edits.map((edit) => edit.placement);
  if (new Set(placements).size !== placements.length) {
    throw new Error('Two teams cannot share the same placement.');
  }

  const teamNos = edits.map((edit) => edit.teamNo);
  if (new Set(teamNos).size !== teamNos.length) {
    throw new Error('The same team cannot appear twice in one map.');
  }

  return edits.map((edit) => {
    const killPoints = edit.eliminations * ruleset.pointsPerElimination;
    const placementPoints = ruleset.placementPoints[edit.placement - 1] ?? 0;
    return {
      teamNo: edit.teamNo,
      placement: edit.placement,
      eliminations: edit.eliminations,
      killPoints,
      placementPoints,
      totalPoints: killPoints + placementPoints,
    };
  });
}

/** `mapNumber` is positional, so it is rewritten from the array order after every insert or delete. */
function renumber(maps: readonly ClosedMapResult[]): ClosedMapResult[] {
  return maps.map((entry, index) => ({ ...entry, mapNumber: index + 1 }));
}

/**
 * Owns the persisted series/tournament history (ADR-0004) and the small amount of in-memory state
 * needed to detect, unassisted, when the currently running map has ended.
 *
 * Deliberately separate from `MatchStore`: that store's own job (this match, in memory only) does
 * not change here — this store watches its projections from the outside and decides when to freeze
 * one into permanent history. `getSeriesTotals`/`getSeriesHasAppeared` are recomputed fresh from
 * `closedMaps` on every call rather than cached, so editing or deleting a past map can never leave a
 * stale aggregate anywhere (specs/SCORING-LOGIC-UPDATE.md's own "recompute, don't accumulate" rule,
 * applied here too).
 */
export class SeriesStore {
  private readonly document: JsonDocument<SeriesDocument>;
  private readonly stabilityTicks: number;

  private candidateMatchId: string | null = null;
  private candidateStableCount = 0;
  private trustedMatchId: string | null = null;
  private currentMapStartedAt: number | null = null;
  private endedStableCount = 0;
  /** The match id a map has already been persisted for, so continued `ended` polling never repeats it. */
  private lastClosedMatchId: string | null = null;

  constructor(options: SeriesStoreOptions) {
    this.stabilityTicks = options.stabilityTicks ?? DEFAULT_STABILITY_TICKS;
    this.document = new JsonDocument({
      filePath: path.join(options.dataDir, 'series.json'),
      schema: seriesDocumentSchema,
      createDefault: () => createDefaultSeriesDocument(randomUUID()),
      migrate: migrateSchemaVersionOnly,
      onWarn: options.onWarn,
    });
  }

  async load(): Promise<void> {
    await this.document.load();
  }

  getState(): SeriesDocument {
    return this.document.current;
  }

  getSeriesTotals(): ReadonlyMap<number, number> {
    const totals = new Map<number, number>();
    for (const map of this.document.current.closedMaps) {
      for (const team of map.teams) {
        totals.set(team.teamNo, (totals.get(team.teamNo) ?? 0) + team.totalPoints);
      }
    }
    return totals;
  }

  getSeriesHasAppeared(): ReadonlySet<number> {
    const teams = new Set<number>();
    for (const map of this.document.current.closedMaps) {
      for (const team of map.teams) teams.add(team.teamNo);
    }
    return teams;
  }

  /**
   * How much of `matchId`'s own points is already recorded in the history, per team.
   *
   * What `MatchStore` needs to stop counting a still-displayed match twice — see its
   * `bankedPointsByTeam`. Derived fresh from `closedMaps` on every call like every other aggregate
   * here, so a deleted map, a correction or a series reset takes effect immediately with nothing to
   * invalidate.
   */
  getBankedPointsForMatch(matchId: string | null): ReadonlyMap<number, BankedPoints> {
    const banked = new Map<number, BankedPoints>();
    if (matchId === null) return banked;

    for (const map of this.document.current.closedMaps) {
      if (map.matchId !== matchId) continue;
      for (const team of map.teams) {
        const running = banked.get(team.teamNo);
        banked.set(team.teamNo, {
          killPoints: (running?.killPoints ?? 0) + team.killPoints,
          placementPoints: (running?.placementPoints ?? 0) + team.placementPoints,
        });
      }
    }
    return banked;
  }

  /** Whether the history already holds a map closed from this PCOB match. */
  private hasClosedMapFor(matchId: string): boolean {
    return this.document.current.closedMaps.some((entry) => entry.matchId === matchId);
  }

  /**
   * Call after every ingest update. Tracks match-id and `ended`-phase stability, and persists a
   * closed map, at most once per match id, once both are trusted.
   *
   * Returns the map it just closed, or `null` if this call closed nothing.
   */
  async observeMatch(projection: Projection, now: number): Promise<ClosedMapResult | null> {
    const { matchId, phase } = projection.match;

    if (matchId === null) {
      this.resetObservation();
      return null;
    }

    if (matchId !== this.candidateMatchId) {
      this.candidateMatchId = matchId;
      this.candidateStableCount = 1;
    } else if (this.candidateStableCount < this.stabilityTicks) {
      this.candidateStableCount += 1;
    }

    if (this.candidateStableCount >= this.stabilityTicks && this.trustedMatchId !== matchId) {
      this.trustedMatchId = matchId;
      this.currentMapStartedAt = now;
      this.endedStableCount = 0;
    }

    if (this.trustedMatchId !== matchId) return null; // Candidate not stable yet.

    if (phase !== 'ended') {
      this.endedStableCount = 0;
      return null;
    }

    this.endedStableCount += 1;
    if (this.endedStableCount < this.stabilityTicks) return null;

    // Both guards are needed, and neither is redundant. The in-memory one is the hot path while
    // polling continues through the `ended` phase; the persisted one is what survives a restart in
    // that same window — PCOB keeps serving a finished match's final stats until the next game
    // starts, so a backend restarted mid-recap would otherwise re-run the whole stability check and
    // record the same map a second time, silently doubling every team's points for it.
    if (this.lastClosedMatchId === matchId || this.hasClosedMapFor(matchId)) return null;

    this.lastClosedMatchId = matchId;
    return this.persistClosedMap(projection, now);
  }

  /**
   * An operator-triggered close, from the Series control page. Skips the stability wait entirely —
   * an explicit action is trusted immediately — and reuses `MatchStore.projectAsEnded()`'s survivor
   * resolution via the `projection` the caller passes in.
   */
  async closeMapNow(projection: Projection, now: number): Promise<ClosedMapResult> {
    const { matchId } = projection.match;

    // Without this a click with no match running records an empty map, which then has to be found
    // and deleted by hand before the series totals read correctly again.
    if (matchId === null) {
      throw new Error('There is no match running to close. Add the map by hand instead.');
    }

    // A second close of the same PCOB match would record that match's points twice: the projection
    // reports them cumulatively from the match's own start, so the second map would repeat
    // everything the first one already banked. Adding the map by hand is the supported way to record
    // a result the app did not observe.
    if (this.hasClosedMapFor(matchId)) {
      throw new Error(
        'This match has already been closed into the series. Add a map by hand if you need another entry.',
      );
    }

    // A match id can outlive the player list it belongs to. Recording the empty map that results is
    // the same nuisance as recording one with no match at all: a zero-point entry that has to be
    // hunted down and deleted before the totals read correctly again.
    if (!projection.match.teams.some((team) => team.hasAppeared && team.placement !== null)) {
      throw new Error('No team has played this map yet, so there is nothing to record.');
    }

    this.lastClosedMatchId = matchId;
    return this.persistClosedMap(projection, now);
  }

  /**
   * Record a map that the app never observed — one played before it was running, or on another
   * machine — at any position in the series, not only at the end.
   *
   * `position` is 1-based and clamped to the ends, so "1" puts it first and anything at or past the
   * current length appends. Every map is renumbered afterwards, which is what makes inserting
   * between two existing maps meaningful at all.
   */
  async insertManualMap(
    position: number,
    teams: readonly ClosedMapTeamEdit[],
    ruleset: ScoringRuleset,
  ): Promise<ClosedMapResult> {
    if (teams.length === 0) {
      throw new Error('A map needs at least one team result.');
    }

    const current = this.document.current;
    const map: ClosedMapResult = {
      id: randomUUID(),
      // Overwritten by `renumber` below; the array position is the real source of truth.
      mapNumber: 1,
      mapName: null,
      // Never observed, so there is no match to attribute it to and no clock to report. See
      // `closedMapResultSchema` on why a fabricated `endedAt` would be worse than none.
      matchId: null,
      startedAt: null,
      endedAt: null,
      teams: resultsFromEdits(teams, ruleset),
    };

    const index = Math.max(0, Math.min(current.closedMaps.length, position - 1));
    const closedMaps = renumber([
      ...current.closedMaps.slice(0, index),
      map,
      ...current.closedMaps.slice(index),
    ]);

    await this.document.write({ ...current, closedMaps });
    // The renumbered copy, not the local `map` — its `mapNumber` is only correct after renumbering.
    return closedMaps[index] as ClosedMapResult;
  }

  /**
   * Clears the persisted history and this store's own auto-detection tracking, so map numbering
   * restarts cleanly. Deliberately does not touch `MatchStore` — a reset performed mid-map leaves the
   * currently running map's own elimination tracking untouched; it becomes map 1 of the new series
   * once it closes (confirmed with the operator rather than assumed).
   */
  async resetSeries(): Promise<SeriesDocument> {
    this.resetObservation();
    return this.document.write(createDefaultSeriesDocument(randomUUID()));
  }

  /**
   * Wholesale replace the persisted history — a full-backup import (specs, "Import & Export"), not
   * an operator action on this page. `document` must already be schema-valid; the caller (the import
   * pipeline) is responsible for validating and migrating it first, the same way a document loaded
   * from disk normally is. Resets this store's own auto-detection tracking, same reasoning as
   * `resetSeries`: the imported history knows nothing about whatever match is currently running on
   * this machine.
   */
  async replaceState(document: SeriesDocument): Promise<SeriesDocument> {
    this.resetObservation();
    return this.document.write(document);
  }

  /**
   * Replaces one closed map's per-team results. `placement`/`eliminations` are the only inputs
   * accepted — points are always re-derived from the ruleset, never taken as a direct override, and
   * the edited team set must exactly match the map's original teams (this corrects a wrong result,
   * it does not redefine who played).
   */
  async editClosedMap(
    mapId: string,
    edits: readonly ClosedMapTeamEdit[],
    ruleset: ScoringRuleset,
  ): Promise<SeriesDocument> {
    const current = this.document.current;
    const map = current.closedMaps.find((entry) => entry.id === mapId);
    if (!map) throw new Error(`No closed map with the id "${mapId}".`);

    const originalTeamNos = new Set(map.teams.map((team) => team.teamNo));
    const editedTeamNos = new Set(edits.map((edit) => edit.teamNo));
    if (
      originalTeamNos.size !== editedTeamNos.size ||
      [...originalTeamNos].some((teamNo) => !editedTeamNos.has(teamNo))
    ) {
      throw new Error('An edit must cover exactly the teams already recorded for this map.');
    }

    const teams = resultsFromEdits(edits, ruleset);

    return this.document.write({
      ...current,
      closedMaps: current.closedMaps.map((entry) =>
        entry.id === mapId ? { ...entry, teams } : entry,
      ),
    });
  }

  /** Removes a closed map (a bogus auto-detected entry, most likely) and renumbers the rest. */
  async deleteClosedMap(mapId: string): Promise<SeriesDocument> {
    const current = this.document.current;
    if (!current.closedMaps.some((entry) => entry.id === mapId)) {
      throw new Error(`No closed map with the id "${mapId}".`);
    }

    const remaining = renumber(current.closedMaps.filter((entry) => entry.id !== mapId));

    return this.document.write({ ...current, closedMaps: remaining });
  }

  private resetObservation(): void {
    this.candidateMatchId = null;
    this.candidateStableCount = 0;
    this.trustedMatchId = null;
    this.currentMapStartedAt = null;
    this.endedStableCount = 0;
    this.lastClosedMatchId = null;
  }

  private async persistClosedMap(projection: Projection, now: number): Promise<ClosedMapResult> {
    const current = this.document.current;

    // By the time a projection reaches here every present team has a real, final placement — both
    // the natural `ended` phase and `projectAsEnded()` resolve every survivor via the same shared
    // slot pool (`MatchStore.resolvePlacements`). A team without one is dropped rather than given a
    // fabricated placement; this should not happen and is a defensive guard, not an expected path.
    const teams: ClosedMapTeamResult[] = projection.match.teams
      .filter((team) => team.hasAppeared && team.placement !== null)
      .map((team) => ({
        teamNo: team.teamNo,
        placement: team.placement as number,
        eliminations: team.eliminations,
        killPoints: team.killPoints,
        placementPoints: team.placementPoints,
        // This map's own contribution only — `team.totalPoints` already includes series points fed
        // in via `MatchStore.setSeriesContext`, and persisting that would double-count them into
        // every future series total the moment this map closes.
        totalPoints: team.killPoints + team.placementPoints,
      }));

    const closedMap: ClosedMapResult = {
      id: randomUUID(),
      mapNumber: current.closedMaps.length + 1,
      mapName: null,
      matchId: projection.match.matchId,
      startedAt: this.currentMapStartedAt,
      endedAt: now,
      teams,
    };

    await this.document.write({ ...current, closedMaps: [...current.closedMaps, closedMap] });
    return closedMap;
  }
}
