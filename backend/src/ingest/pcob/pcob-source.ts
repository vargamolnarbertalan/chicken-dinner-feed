import type { IngestSourceKind } from '@cdf/shared';
import type { IngestSource, IngestSourceEvents } from '../source.js';
import { PcobMapper, type PcobSnapshot } from './payload.js';

export interface PcobSourceOptions {
  /** Where the PCOB API answers. The OB PC's address — not necessarily loopback (ADR-0010). */
  baseUrl: string;
  /** Upstream refreshes every ~2 s, so polling faster than this wins nothing. */
  pollMs?: number;
  /**
   * Per-request timeout.
   *
   * **Not defensive habit.** ob.js dispatches on `app[pathname]` and, when no handler matches, logs
   * and returns *without ever ending the response* — the socket is left open. A route we get wrong
   * would hang the poll loop rather than erroring (`specs/PCOB-API.md` §1).
   */
  timeoutMs?: number;
  log?: (message: string) => void;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_POLL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * The real ingestion adapter: an HTTP poller against the PCOB API (ADR-0010).
 *
 * Two routes per poll, and the choice of routes is the interesting part:
 *
 * - **`getallinfo`** rather than the documented `gettotalplayerlist` + `getteaminfolist`. Reading
 *   ob.js showed that the *only* way match data enters the server is `POST /totalmessage`, which
 *   replaces `app.allInfo` wholesale; every documented `get*` route is a projection of that single
 *   object. `getallinfo` returns it whole — so players, teams and `GameID` all come from one
 *   snapshot, and `GameID` is reachable **nowhere else** (`specs/PCOB-API.md` §3b, §4).
 * - **`isingame`**, which is separate state (`app.isInGame`, set by its own POST) and therefore
 *   genuinely a second request.
 *
 * Written for where it runs: unattended, mid-broadcast, with nobody able to intervene. It never
 * throws out of the poll loop. A refused connection is the *normal* state before `launch.bat` is
 * running, not an error, so it is reported as `disconnected` and retried rather than escalated.
 */
export class PcobSource implements IngestSource {
  readonly kind: IngestSourceKind = 'pcob';

  private readonly baseUrl: string;
  private readonly pollMs: number;
  private readonly timeoutMs: number;
  private readonly log: (message: string) => void;
  private readonly fetchImpl: typeof fetch;
  private readonly mapper: PcobMapper;

  private events: IngestSourceEvents | null = null;
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private connected = false;

  constructor(options: PcobSourceOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.log = options.log ?? (() => {});
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.mapper = new PcobMapper({ log: this.log });
  }

  start(events: IngestSourceEvents): void {
    this.events = events;
    events.onStatus('connecting', `Polling the PCOB API at ${this.baseUrl}`);

    void this.poll();
    this.timer ??= setInterval(() => void this.poll(), this.pollMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.connected = false;
    this.events?.onStatus('disconnected', 'PCOB polling stopped');
    this.events = null;
  }

  /** Exposed for tests, which drive polls deterministically rather than waiting on a timer. */
  async poll(): Promise<void> {
    // A slow response must not let the next tick start a second overlapping poll; they would race
    // to update the mapper's slot assignments.
    if (this.polling || !this.events) return;
    this.polling = true;

    try {
      const [allInfo, isInGame] = await Promise.all([
        this.getJson('getallinfo'),
        this.getJson('isingame'),
      ]);

      const snapshot: PcobSnapshot = {
        allInfo: readProperty(allInfo, 'allinfo') ?? {},
        isInGame: readProperty(isInGame, 'isInGame') === true,
      };

      if (!this.connected) {
        this.connected = true;
        this.events.onStatus('connected', null);
      }
      this.events.onUpdate(this.mapper.map(snapshot));
    } catch (cause) {
      this.reportOffline(cause);
    } finally {
      this.polling = false;
    }
  }

  private async getJson(route: string): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}/${route}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}`);

      // Read as text and parse ourselves: ob.js answers with a bare `response.write(str)` and sets
      // no Content-Type at all, so anything that dispatches on the header is unreliable here.
      const body = await response.text();
      return JSON.parse(body) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Report the source as unreachable without treating it as a failure.
   *
   * Before an operator ticks "API Enable" and starts `launch.bat` this is the expected state, and it
   * is also what a mid-match PCOB crash looks like. The overlay holds its last known good state
   * either way (ADR-0006); the admin's indicator is what tells the operator which it is.
   */
  private reportOffline(cause: unknown): void {
    const detail = cause instanceof Error ? cause.message : String(cause);

    if (this.connected || this.events === null) {
      this.log(`PCOB API unreachable: ${detail}`);
    }
    this.connected = false;
    this.events?.onStatus('disconnected', `Cannot reach the PCOB API at ${this.baseUrl}`);
  }
}

/** One property off an unknown JSON value, without asserting the whole shape. */
function readProperty(source: unknown, key: string): unknown {
  if (!source || typeof source !== 'object') return undefined;
  return (source as Record<string, unknown>)[key];
}
