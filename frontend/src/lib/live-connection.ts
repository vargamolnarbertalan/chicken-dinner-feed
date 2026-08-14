import { PROTOCOL_VERSION, serverMessageSchema, type ServerMessage } from '@cdf/shared';

export type ConnectionPhase = 'connecting' | 'open' | 'closed';

export interface LiveConnectionHandlers {
  onMessage(message: ServerMessage): void;
  onPhase(phase: ConnectionPhase): void;
  onProtocolMismatch(serverVersion: number): void;
}

export interface LiveConnectionOptions extends LiveConnectionHandlers {
  /** Overlay instance this client renders. Omitted by the admin and other observers. */
  instanceId?: string;
  /**
   * Declares this as the admin's preview rather than a broadcast browser source.
   *
   * Changes nothing about what is received. The server uses it to report at `/feedback` how many
   * browser sources are actually rendering an overlay — a count the preview would otherwise inflate
   * to exactly the wrong answer, since the operator asking is asking about OBS.
   */
  isPreview?: boolean;
  /** Injectable for tests; defaults to the same origin the page was served from. */
  url?: string;
}

const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 10_000;

function defaultUrl(instanceId?: string, isPreview?: boolean): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams();
  if (instanceId) query.set('instance', instanceId);
  if (isPreview) query.set('preview', '1');

  const search = query.size > 0 ? `?${query}` : '';
  return `${protocol}//${window.location.host}/ws/live${search}`;
}

/**
 * The overlay's link to the backend.
 *
 * Written defensively because of where it runs: inside a broadcast browser source that nobody is
 * watching. It may be opened before the backend exists, survive a backend restart mid-match, and
 * has no user to press refresh. So it reconnects for as long as the page is open, backing off to
 * avoid hammering a server that is down, and it never throws — a parse failure logs and is dropped
 * rather than tearing down a working overlay.
 *
 * Messages are validated against the shared schema (ADR-0007). A protocol version the client does
 * not understand is surfaced rather than partially rendered: a stale browser source showing subtly
 * wrong data is worse than one that says it is stale.
 */
export class LiveConnection {
  private readonly options: LiveConnectionOptions;
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private closedByUs = false;

  constructor(options: LiveConnectionOptions) {
    this.options = options;
  }

  connect(): void {
    this.closedByUs = false;
    this.open();
  }

  close(): void {
    this.closedByUs = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  private open(): void {
    this.options.onPhase('connecting');

    const socket = new WebSocket(
      this.options.url ?? defaultUrl(this.options.instanceId, this.options.isPreview),
    );
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.attempt = 0;
      this.options.onPhase('open');
    });

    socket.addEventListener('message', (event) => this.handleMessage(event));

    socket.addEventListener('close', () => {
      this.options.onPhase('closed');
      this.scheduleReconnect();
    });

    // 'error' is always followed by 'close', so reconnection is handled there and this only exists
    // to stop the event surfacing as an unhandled error.
    socket.addEventListener('error', () => {});
  }

  private handleMessage(event: MessageEvent): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(event.data));
    } catch {
      console.warn('[live] dropped a message that was not valid JSON');
      return;
    }

    const result = serverMessageSchema.safeParse(parsed);
    if (!result.success) {
      const version = (parsed as { protocolVersion?: unknown } | null)?.protocolVersion;
      if (typeof version === 'number' && version !== PROTOCOL_VERSION) {
        this.options.onProtocolMismatch(version);
        return;
      }
      console.warn('[live] dropped a message that did not match the schema', result.error.issues);
      return;
    }

    if (result.data.protocolVersion !== PROTOCOL_VERSION) {
      this.options.onProtocolMismatch(result.data.protocolVersion);
      return;
    }

    this.options.onMessage(result.data);
  }

  private scheduleReconnect(): void {
    if (this.closedByUs || this.retryTimer) return;

    // Exponential backoff with jitter: a venue where the backend is restarted should not be met
    // with a synchronised retry storm from every open browser source.
    const backoff = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** this.attempt);
    const delay = backoff / 2 + Math.random() * (backoff / 2);
    this.attempt += 1;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }
}
