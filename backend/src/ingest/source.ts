import type {
  IngestConnectionState,
  IngestSourceKind,
  MatchPhase,
  PlayerLiveState,
} from '@cdf/shared';

/**
 * A player exactly as an ingestion adapter reports it: raw facts, no scoring, no ranking.
 *
 * Points, placement and rank are computed downstream because the PCOB API does not supply them
 * (specs/PCOB-FINDINGS.md §2.4). Keeping them out of this type means an adapter cannot accidentally
 * become the place where scoring rules live.
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
}
