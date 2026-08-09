import type { LiveSnapshot, ServerMessage } from '@cdf/shared';
import { PROTOCOL_VERSION } from '@cdf/shared';
import type { MatchStore, Projection } from '../state/match-store.js';

/**
 * The little of a WebSocket we actually use.
 *
 * Structural rather than imported so the hub can be exercised with a plain object, and so the
 * broadcast logic does not depend on a specific socket library.
 */
export interface LiveClient {
  readyState: number;
  send(data: string): void;
}

/** `WebSocket.OPEN`. Sending to a socket in any other state throws. */
const SOCKET_OPEN = 1;

export interface LiveHubOptions {
  store: MatchStore;
  /**
   * Updates arriving faster than this collapse into one broadcast. Bounds client work regardless of
   * how the source behaves, and costs at most this much latency.
   */
  coalesceMs?: number;
  /** How often to check whether a connected source has gone quiet. */
  staleCheckMs?: number;
}

/**
 * Owns the live fan-out: who is connected, what they were last sent, and when to send again.
 *
 * Two rules from ADR-0007 are implemented here and are the reason this is not just a `for` loop
 * over sockets:
 *
 * 1. **Broadcast only on real change.** The comparison is made against the *rendered* projection,
 *    so an ingest update that changes nothing visible produces no message — and therefore no
 *    re-render and no spurious animation on air.
 * 2. **Snapshot on connect.** A browser source reloaded mid-match is correct immediately rather
 *    than after the next change, which might be seconds away or never.
 */
export class LiveHub {
  private readonly clients = new Set<LiveClient>();
  private readonly store: MatchStore;
  private readonly coalesceMs: number;
  private readonly staleCheckMs: number;

  private revision = 0;
  private lastChangeKey: string | null = null;
  private lastSnapshot: LiveSnapshot | null = null;

  private coalesceTimer: NodeJS.Timeout | null = null;
  private staleTimer: NodeJS.Timeout | null = null;

  constructor(options: LiveHubOptions) {
    this.store = options.store;
    this.coalesceMs = options.coalesceMs ?? 50;
    this.staleCheckMs = options.staleCheckMs ?? 1000;
  }

  start(): void {
    this.publish();
    this.staleTimer ??= setInterval(() => {
      if (this.store.markStaleIfSilent()) this.publish();
    }, this.staleCheckMs);
  }

  stop(): void {
    if (this.staleTimer) clearInterval(this.staleTimer);
    if (this.coalesceTimer) clearTimeout(this.coalesceTimer);
    this.staleTimer = null;
    this.coalesceTimer = null;
  }

  addClient(client: LiveClient): void {
    this.clients.add(client);
    const snapshot = this.lastSnapshot ?? this.buildSnapshot(this.store.project());
    this.sendTo(client, { type: 'snapshot', protocolVersion: PROTOCOL_VERSION, snapshot });
  }

  removeClient(client: LiveClient): void {
    this.clients.delete(client);
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /** Coalescing entry point. Call this from anything that might have changed the state. */
  schedulePublish(): void {
    if (this.coalesceTimer) return;
    this.coalesceTimer = setTimeout(() => {
      this.coalesceTimer = null;
      this.publish();
    }, this.coalesceMs);
  }

  /**
   * Broadcast if — and only if — the rendered state differs from what clients were last sent.
   *
   * Returns whether anything was sent, which is what the tests assert on.
   */
  publish(): boolean {
    const projection = this.store.project();
    const key = changeKeyOf(projection);

    if (key === this.lastChangeKey) return false;
    this.lastChangeKey = key;

    const snapshot = this.buildSnapshot(projection);
    this.lastSnapshot = snapshot;

    const message: ServerMessage = {
      type: 'snapshot',
      protocolVersion: PROTOCOL_VERSION,
      snapshot,
    };
    for (const client of this.clients) this.sendTo(client, message);

    return true;
  }

  private buildSnapshot(projection: Projection): LiveSnapshot {
    return {
      revision: ++this.revision,
      generatedAt: Date.now(),
      ingest: projection.ingest,
      match: projection.match,
    };
  }

  private sendTo(client: LiveClient, message: ServerMessage): void {
    if (client.readyState !== SOCKET_OPEN) return;
    try {
      client.send(JSON.stringify(message));
    } catch {
      // A socket that fails mid-broadcast must not take down the others, or one stalled browser
      // source would blank every overlay in the production.
      this.clients.delete(client);
    }
  }
}

/**
 * Identity of a projection for change-detection purposes.
 *
 * `ingest.lastUpdateAt` is excluded deliberately. It advances on every poll even when the match
 * state is byte-for-byte identical, so including it would make every single poll a broadcast — the
 * exact behaviour ADR-0007's change detection exists to prevent. Clients that display "last update
 * N seconds ago" tick that locally from the value they already hold.
 */
function changeKeyOf(projection: Projection): string {
  const { lastUpdateAt: _ignored, ...ingest } = projection.ingest;
  return JSON.stringify({ ingest, match: projection.match });
}
