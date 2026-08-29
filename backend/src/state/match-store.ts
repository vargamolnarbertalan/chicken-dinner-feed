import type {
  IngestConnectionState,
  IngestSourceKind,
  IngestStatus,
  MatchPhase,
  MatchState,
  ScoringRuleset,
  TeamRosterEntry,
} from '@cdf/shared';
import { DEFAULT_SCORING_RULESET, DEFAULT_TEAM_ROSTER } from '@cdf/shared';
import type { IngestUpdate } from '../ingest/source.js';
import { computeStandings } from '../scoring/standings.js';

export interface MatchStoreOptions {
  source: IngestSourceKind;
  roster?: readonly TeamRosterEntry[];
  ruleset?: ScoringRuleset;
  /** How long without an update before a connected source is reported as stale. */
  staleAfterMs?: number;
}

export interface Projection {
  ingest: IngestStatus;
  match: MatchState;
}

/**
 * Holds the current match, in memory only.
 *
 * Live telemetry is deliberately not persisted (ADR-0004) — it is worthless once the match ends and
 * the after-match figures arrive. What the store does own that cannot be recomputed is the
 * **elimination order**, which is the only way to award placement points: a team's placement is
 * decided by when it went out, and that ordering is not present in any single ingest update.
 *
 * The store also holds the last known good update. When the source drops mid-match, keeping it is
 * what stops the overlay blanking out on air (ADR-0006).
 */
export class MatchStore {
  private readonly staleAfterMs: number;
  private roster: readonly TeamRosterEntry[];
  private ruleset: ScoringRuleset;

  private lastUpdate: IngestUpdate | null = null;
  private connectionState: IngestConnectionState = 'disconnected';
  private statusMessage: string | null = null;
  private lastUpdateAt: number | null = null;

  /** Team numbers in the order they were wiped out. Index 0 went out first, so it placed last. */
  private eliminationOrder: number[] = [];
  private readonly eliminated = new Set<number>();
  /**
   * Team numbers actually reported by the ingest source this match — not the configured roster.
   *
   * A roster is sized for a full tournament (16–25 teams) and is reused for small test rooms with a
   * handful of real participants. Sizing placement math off `roster.length` in that case invents a
   * bracket that never existed and can rank a real, API-confirmed placement behind teams that were
   * never in the lobby at all.
   */
  private readonly seenTeams = new Set<number>();

  /**
   * Points already banked in earlier, closed maps of the series, and which teams have appeared in
   * some earlier map even if not this one — set from outside by whatever owns the series history
   * (specs/SCORING-LOGIC-UPDATE.md). Default to nothing, so a store nobody has told about a series
   * behaves exactly as it always has: this-match-only points.
   */
  private seriesPointsByTeam: ReadonlyMap<number, number> = new Map();
  private seriesHasAppeared: ReadonlySet<number> = new Set();

  constructor(private readonly options: MatchStoreOptions) {
    this.roster = options.roster ?? DEFAULT_TEAM_ROSTER.teams;
    this.ruleset = options.ruleset ?? DEFAULT_SCORING_RULESET;
    this.staleAfterMs = options.staleAfterMs ?? 10_000;
  }

  setRuleset(ruleset: ScoringRuleset): void {
    this.ruleset = ruleset;
  }

  /** See the field comments above. Called whenever the series history changes. */
  setSeriesContext(
    seriesPointsByTeam: ReadonlyMap<number, number>,
    seriesHasAppeared: ReadonlySet<number>,
  ): void {
    this.seriesPointsByTeam = seriesPointsByTeam;
    this.seriesHasAppeared = seriesHasAppeared;
  }

  /**
   * Replace the roster.
   *
   * Applied to the next projection rather than to stored state, so an operator fixing a team name
   * mid-match sees it on air at the next update without disturbing the standings.
   */
  setRoster(roster: readonly TeamRosterEntry[]): void {
    this.roster = roster;
  }

  setStatus(state: IngestConnectionState, message: string | null = null): void {
    this.connectionState = state;
    this.statusMessage = message;
  }

  applyUpdate(update: IngestUpdate, now: number = Date.now()): void {
    // A new match resets the elimination history; carrying it over would award placement points
    // from the previous game.
    if (this.lastUpdate && this.lastUpdate.matchId !== update.matchId) {
      this.resetMatch();
    }
    if (this.lastUpdate?.phase !== 'idle' && update.phase === 'idle') {
      this.resetMatch();
    }

    this.lastUpdate = update;
    this.lastUpdateAt = now;
    this.connectionState = 'connected';
    this.statusMessage = null;

    for (const player of update.players) this.seenTeams.add(player.teamNo);
    this.recordNewlyEliminatedTeams(update);
  }

  /**
   * Flip a connected source to `stale` when it has gone quiet for too long.
   *
   * Called on a timer rather than on update, because the whole point is detecting the *absence* of
   * updates — usually the room host dropping, which the guideline warns stops all API data.
   */
  markStaleIfSilent(now: number = Date.now()): boolean {
    if (this.connectionState !== 'connected') return false;
    if (this.lastUpdateAt === null) return false;
    if (now - this.lastUpdateAt < this.staleAfterMs) return false;

    this.connectionState = 'stale';
    this.statusMessage = 'No new data recently — check that the room host is still connected.';
    return true;
  }

  /**
   * The complete rendered state, and nothing that changes on its own.
   *
   * Deliberately carries no timestamp: the broadcaster stamps that. If the projection contained
   * `Date.now()` it would differ on every call, defeating the change detection that stops the
   * overlay re-animating twice a second for nothing (ADR-0007).
   */
  project(): Projection {
    return this.buildProjection(this.lastUpdate?.phase ?? 'idle');
  }

  /**
   * The match as it would resolve **right now**, as if it had just ended — reuses the exact same
   * survivor-assignment logic as a real `ended` transition (`resolvePlacements`) instead of
   * duplicating it. What a manual "close this map now" (specs/SCORING-LOGIC-UPDATE.md) needs: a
   * still-alive team must get a real placement, not a guaranteed-minimum, once an operator has
   * decided the map is over. Does not touch the store's own tracked phase or connection state — PCOB
   * may yet report the real end, and this must not have lied to it.
   */
  projectAsEnded(): Projection {
    return this.buildProjection('ended');
  }

  private buildProjection(phase: MatchPhase): Projection {
    const update = this.lastUpdate;

    const teams = computeStandings({
      players: update?.players ?? [],
      roster: this.roster,
      ruleset: this.ruleset,
      placements: this.resolvePlacements(phase),
      presentTeams: this.seenTeams,
      seriesPointsByTeam: this.seriesPointsByTeam,
      seriesHasAppeared: this.seriesHasAppeared,
    });

    return {
      ingest: {
        source: this.options.source,
        state: this.connectionState,
        lastUpdateAt: this.lastUpdateAt,
        message: this.statusMessage,
      },
      match: {
        matchId: update?.matchId ?? null,
        phase,
        teams,
        // A never-present team is not eliminated (it was never in the fight to lose), but it must
        // not inflate the count either — a director reading this off a Stream Deck button needs the
        // number of teams actually left in a real, small test lobby, not the size of the roster.
        standingTeamCount: teams.filter((team) => team.hasAppeared && !team.isEliminated).length,
      },
    };
  }

  private resetMatch(): void {
    this.eliminationOrder = [];
    this.eliminated.clear();
    this.seenTeams.clear();
  }

  /**
   * The team's placement straight from PCOB's own `rank` field, per team, for teams where it is
   * known (non-zero). Confirmed reliable by a live capture (`specs/PCOB-API.md` §6): trust it
   * directly rather than only as a cross-check against our own elimination order.
   */
  private apiRankByTeam(): Map<number, number> {
    const ranks = new Map<number, number>();
    for (const player of this.lastUpdate?.players ?? []) {
      if (player.rank <= 0) continue;
      ranks.set(player.teamNo, Math.max(ranks.get(player.teamNo) ?? 0, player.rank));
    }
    return ranks;
  }

  private recordNewlyEliminatedTeams(update: IngestUpdate): void {
    const standingByTeam = new Map<number, number>();
    for (const player of update.players) {
      // Same predicate as scoring/standings.ts, and for the same reason: a disconnected player is
      // not eliminated. Treating them as out here would freeze their team's placement early, and
      // placement is irreversible once recorded.
      const isStanding =
        player.liveState === 'alive' ||
        player.liveState === 'knocked' ||
        player.liveState === 'disconnected';
      const standing = isStanding ? 1 : 0;
      standingByTeam.set(player.teamNo, (standingByTeam.get(player.teamNo) ?? 0) + standing);
    }

    for (const [teamNo, standingCount] of standingByTeam) {
      if (standingCount === 0 && !this.eliminated.has(teamNo)) {
        this.eliminated.add(teamNo);
        this.eliminationOrder.push(teamNo);
      }
    }
  }

  /**
   * Map team numbers to final placements.
   *
   * PCOB's own `rank` is authoritative wherever it is known — see `apiRankByTeam`. Our elimination
   * order is the fallback, for a team we believe is out but whose API rank has not caught up yet.
   * Teams still standing have not placed and get nothing, until the match ends, at which point the
   * survivors take the remaining top positions, best points first.
   *
   * Every placement number handed out by the fallback or by the survivor pass comes from a single
   * shared pool of the slots the API has *not* already claimed. This matters because our own
   * elimination tracking and the API's `rank` are not always the same story — a poll can catch one
   * player's group mid-update while a teammate's is still last tick's (`specs/PCOB-API.md` §4), so
   * a team we believe eliminated can turn out to already have an API rank, or a team we count as
   * still standing can be the one true survivor while another team's rank has not arrived yet. Two
   * teams computing to the same number — two teams both "1st place" — used to be reachable this
   * way; drawing every number from one pool that shrinks as it is spent makes that structurally
   * impossible, whatever the two sources disagree about.
   */
  private resolvePlacements(phase: MatchState['phase']): ReadonlyMap<number, number> {
    const placements = new Map<number, number>(this.apiRankByTeam());

    const totalSeen = this.seenTeams.size;
    const claimed = new Set(placements.values());
    // Worst-to-best (descending): exactly the order the elimination-order fallback needs, since the
    // earliest-eliminated team belongs at the worst slot nobody has already claimed.
    const available: number[] = [];
    for (let slot = totalSeen; slot >= 1; slot -= 1) {
      if (!claimed.has(slot)) available.push(slot);
    }

    for (const teamNo of this.eliminationOrder) {
      if (placements.has(teamNo)) continue; // The API already answered for this team.
      const slot = available.shift();
      if (slot === undefined) break; // Every slot is already claimed by an API-reported rank.
      placements.set(teamNo, slot);
    }

    if (phase !== 'ended') return placements;

    const survivors = [...this.seenTeams].filter((teamNo) => !placements.has(teamNo));

    // Normally exactly one team survives. If more do — a match cut short, say — order them by the
    // points they earned rather than leaving placement undefined.
    const killsByTeam = new Map<number, number>();
    for (const player of this.lastUpdate?.players ?? []) {
      killsByTeam.set(player.teamNo, (killsByTeam.get(player.teamNo) ?? 0) + player.kills);
    }

    // Survivors take the best remaining slots, best performer first — `available` is still
    // descending, so its tail end is the best (lowest) of what is left.
    survivors
      .sort((a, b) => (killsByTeam.get(b) ?? 0) - (killsByTeam.get(a) ?? 0) || a - b)
      .forEach((teamNo) => {
        const slot = available.pop();
        if (slot === undefined) return; // No slot left — every one already claimed elsewhere.
        placements.set(teamNo, slot);
      });

    return placements;
  }
}
