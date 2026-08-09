/**
 * Version markers that cross a process boundary.
 *
 * These are deliberately explicit rather than derived from package.json: a browser source may have
 * been open since before the backend was restarted, and a stale overlay must be able to detect that
 * it no longer understands what it is being sent (ADR-0007).
 */

/**
 * Version of the WebSocket live-state protocol.
 *
 * Bump on any change to the message envelope or to the shape of the state snapshot that an older
 * client could not render correctly. Clients reject snapshots whose version they do not know and
 * surface a visible error instead of rendering partial data.
 */
export const PROTOCOL_VERSION = 1;

/**
 * Version of the persisted configuration documents on disk (ADR-0004).
 *
 * Bump when a stored document's shape changes. Every persisted document carries this value so a
 * newer bundle can migrate an operator's existing configuration forward rather than discarding it.
 */
export const CONFIG_SCHEMA_VERSION = 1;
