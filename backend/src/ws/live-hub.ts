import type { LiveSnapshot, OverlayInstance, ServerMessage } from '@cdf/shared';
import { PROTOCOL_VERSION } from '@cdf/shared';
import type { MatchStore, Projection } from '../state/match-store.js';
import type { OverlayControlStore } from '../state/overlay-control-store.js';

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
  /** Optional: without it the hub serves match data only and no visibility messages are sent. */
  overlayControl?: OverlayControlStore;
  /** Resolves an instance's configuration. Returns null for an id that is not configured. */
  resolveInstance?: (instanceId: string) => OverlayInstance | null;
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
  /** Value is the overlay instance the client renders, or null for the admin and other observers. */
  private readonly clients = new Map<LiveClient, string | null>();
  private readonly store: MatchStore;
  private readonly overlayControl: OverlayControlStore | undefined;
  private readonly resolveInstance: ((instanceId: string) => OverlayInstance | null) | undefined;
  private readonly coalesceMs: number;
  private readonly staleCheckMs: number;

  private revision = 0;
  private lastChangeKey: string | null = null;
  private lastSnapshot: LiveSnapshot | null = null;

  private coalesceTimer: NodeJS.Timeout | null = null;
  private staleTimer: NodeJS.Timeout | null = null;
  private unsubscribeOverlayControl: (() => void) | null = null;

  constructor(options: LiveHubOptions) {
    this.store = options.store;
    this.overlayControl = options.overlayControl;
    this.resolveInstance = options.resolveInstance;
    this.coalesceMs = options.coalesceMs ?? 50;
    this.staleCheckMs = options.staleCheckMs ?? 1000;
  }

  start(): void {
    this.publish();
    this.staleTimer ??= setInterval(() => {
      if (this.store.markStaleIfSilent()) this.publish();
    }, this.staleCheckMs);

    // A visibility change goes only to the overlays it concerns, and immediately — a director's key
    // press must not wait for the next coalescing window.
    this.unsubscribeOverlayControl ??=
      this.overlayControl?.subscribe((state) => {
        this.sendOverlayState(state.instanceId);
      }) ?? null;
  }

  stop(): void {
    if (this.staleTimer) clearInterval(this.staleTimer);
    if (this.coalesceTimer) clearTimeout(this.coalesceTimer);
    this.unsubscribeOverlayControl?.();
    this.staleTimer = null;
    this.coalesceTimer = null;
    this.unsubscribeOverlayControl = null;
  }

  addClient(client: LiveClient, instanceId: string | null = null): void {
    this.clients.set(client, instanceId);

    const snapshot = this.lastSnapshot ?? this.buildSnapshot(this.store.project());
    this.sendTo(client, { type: 'snapshot', protocolVersion: PROTOCOL_VERSION, snapshot });

    // Send current visibility and configuration straight away, so a browser source reloaded
    // mid-show comes back in the state it was in rather than defaulting to visible and flashing.
    if (instanceId && this.overlayControl) {
      this.sendTo(client, this.overlayMessage(instanceId));
    }
  }

  /**
   * Push an instance's visibility and configuration to the overlays rendering it.
   *
   * Called both when a director triggers show/hide and when an operator edits appearance in the
   * admin — an appearance change has to reach open browser sources without a reload.
   */
  sendOverlayState(instanceId: string): void {
    if (!this.overlayControl) return;

    const message = this.overlayMessage(instanceId);
    for (const [client, clientInstance] of this.clients) {
      if (clientInstance === instanceId) this.sendTo(client, message);
    }
  }

  /** Every configured instance — used after a bulk config change. */
  refreshAllOverlayStates(): void {
    const instanceIds = new Set(
      [...this.clients.values()].filter((id): id is string => id !== null),
    );
    for (const instanceId of instanceIds) this.sendOverlayState(instanceId);
  }

  private overlayMessage(instanceId: string): ServerMessage {
    return {
      type: 'overlay',
      protocolVersion: PROTOCOL_VERSION,
      overlay: this.overlayControl?.get(instanceId) ?? {
        instanceId,
        visible: true,
        changedAt: 0,
      },
      instance: this.resolveInstance?.(instanceId) ?? null,
    };
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
    for (const client of this.clients.keys()) this.sendTo(client, message);

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
