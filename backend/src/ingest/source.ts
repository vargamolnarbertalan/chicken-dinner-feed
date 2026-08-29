import type {
  IngestConnectionState,
  IngestSourceKind,
  MatchPhase,
  PlayerLiveState,
  TeamRosterEntry,
} from '@cdf/shared';

/**
 * A player exactly as an ingestion adapter reports it: raw facts, no scoring.
 *
 * Points are computed downstream because the PCOB API does not supply them
 * (specs/PCOB-FINDINGS.md §2.4). `rank` is the one exception: PCOB does supply a team's final
 * placement directly, confirmed reliable by a live capture (`specs/PCOB-API.md` §6). It is passed
 * through here rather than computed, so `MatchStore` can trust it over its own elimination-order
 * guess whenever it is known.
 */
export interface IngestPlayer {
  id: string;
  name: string;
  teamNo: number;
  slot: number;
  liveState: PlayerLiveState;
  health: number;
  healthMax: number;
  kills: number;
  /** The team's placement per PCOB's own `rank` field. `0` means not yet known — still playing. */
  rank: number;
}

export interface IngestUpdate {
  matchId: string | null;
  phase: MatchPhase;
  players: IngestPlayer[];
}

export interface IngestSourceEvents {
  onUpdate(update: IngestUpdate): void;
  onStatus(state: IngestConnectionState, message?: string | null): void;
}

/**
 * The single boundary between us and the PCOB API (ADR-0006).
 *
 * Everything the API's shape could change — transport, field names, enum values, error handling —
 * stops here. Implementations own their own reconnection and must never let a source failure
 * propagate as a crash: a refused connection is the normal state before `launch.bat` is running,
 * not an error.
 */
export interface IngestSource {
  readonly kind: IngestSourceKind;
  start(events: IngestSourceEvents): void;
  stop(): Promise<void>;
  /**
   * Rehearse against the operator's actual configured roster rather than a hardcoded stand-in.
   * Mock-only — a real source has no roster concept of its own, it just reports whichever teams the
   * game sends. Optional so `PcobSource` needs no no-op implementation.
   */
  setRoster?(roster: readonly TeamRosterEntry[]): void;
}
