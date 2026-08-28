import { z } from 'zod';

export const ingestSourceKindSchema = z.enum(['mock', 'pcob']);
export type IngestSourceKind = z.infer<typeof ingestSourceKindSchema>;

/**
 * Connection state of the PCOB ingestion adapter.
 *
 * These four are distinguished because they mean different things to an operator standing in a
 * gallery, and "no data" has at least four causes — not whitelisted, "API Enable" not ticked,
 * `launch.bat` not running, host disconnected (specs/PCOB-FINDINGS.md §1.2).
 *
 * - `disconnected` — cannot reach the API. Normal before `launch.bat` is started; not an error.
 * - `connecting`   — attempting, including retry backoff after a failure.
 * - `connected`    — reachable and producing fresh data.
 * - `stale`        — reachable, but nothing new for longer than expected. Usually the room host
 *   dropped. The overlay holds its last known good state rather than blanking (ADR-0006).
 */
export const ingestConnectionStateSchema = z.enum([
  'disconnected',
  'connecting',
  'connected',
  'stale',
]);
export type IngestConnectionState = z.infer<typeof ingestConnectionStateSchema>;

export const ingestStatusSchema = z.object({
  source: ingestSourceKindSchema,
  state: ingestConnectionStateSchema,
  /** Epoch milliseconds of the last successful update; null if there has never been one. */
  lastUpdateAt: z.number().int().nullable(),
  /** Operator-readable reason for the current state. Null when there is nothing to explain. */
  message: z.string().nullable(),
});
export type IngestStatus = z.infer<typeof ingestStatusSchema>;
