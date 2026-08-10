import type {
  IngestConnectionState,
  IngestSourceKind,
  IngestStatus,
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

  constructor(private readonly options: MatchStoreOptions) {
    this.roster = options.roster ?? DEFAULT_TEAM_ROSTER.teams;
    this.ruleset = options.ruleset ?? DEFAULT_SCORING_RULESET;
    this.staleAfterMs = options.staleAfterMs ?? 10_000;
  }

  setRuleset(ruleset: ScoringRuleset): void {
    this.ruleset = ruleset;
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
    const update = this.lastUpdate;
    const phase = update?.phase ?? 'idle';

    const teams = computeStandings({
      players: update?.players ?? [],
      roster: this.roster,
      ruleset: this.ruleset,
      placements: this.resolvePlacements(phase),
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
        standingTeamCount: teams.filter((team) => !team.isEliminated).length,
      },
    };
  }

  private resetMatch(): void {
    this.eliminationOrder = [];
    this.eliminated.clear();
  }

  private recordNewlyEliminatedTeams(update: IngestUpdate): void {
    const standingByTeam = new Map<number, number>();
    for (const player of update.players) {
      const standing = player.liveState === 'alive' || player.liveState === 'knocked' ? 1 : 0;
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
   * A team that went out first placed last, so the elimination order read backwards gives placement.
   * Teams still standing have not placed and get nothing — until the match ends, at which point the
   * survivors take the remaining top positions, best points first.
   */
  private resolvePlacements(phase: MatchState['phase']): ReadonlyMap<number, number> {
    const totalTeams = this.roster.length;
    const placements = new Map<number, number>();

    this.eliminationOrder.forEach((teamNo, index) => {
      placements.set(teamNo, totalTeams - index);
    });

    if (phase !== 'ended') return placements;

    const survivors = this.roster
      .map((entry) => entry.teamNo)
      .filter((teamNo) => !placements.has(teamNo));

    // Normally exactly one team survives. If more do — a match cut short, say — order them by the
    // points they earned rather than leaving placement undefined.
    const killsByTeam = new Map<number, number>();
    for (const player of this.lastUpdate?.players ?? []) {
      killsByTeam.set(player.teamNo, (killsByTeam.get(player.teamNo) ?? 0) + player.kills);
    }

    survivors
      .sort((a, b) => (killsByTeam.get(b) ?? 0) - (killsByTeam.get(a) ?? 0) || a - b)
      .forEach((teamNo, index) => {
        placements.set(teamNo, index + 1);
      });

    return placements;
  }
}
