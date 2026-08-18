import type { IngestSourceKind } from '@cdf/shared';
import { MockSource } from './mock-source.js';
import { PcobSource } from './pcob/pcob-source.js';
import type { IngestSource } from './source.js';

export type { IngestPlayer, IngestSource, IngestSourceEvents, IngestUpdate } from './source.js';
export { MockSource } from './mock-source.js';
export { PcobSource } from './pcob/pcob-source.js';

export interface CreateIngestSourceOptions {
  /** Required for `pcob`. A full origin — the API is not necessarily on loopback (ADR-0010). */
  pcobBaseUrl?: string;
  pcobPollMs?: number;
  pcobTimeoutMs?: number;
  log?: (message: string) => void;
}

/**
 * The one place that knows which adapter implementation exists (ADR-0006).
 *
 * Both are now real. `mock` needs no game and drives development; `pcob` polls the observer API.
 */
export function createIngestSource(
  kind: IngestSourceKind,
  options: CreateIngestSourceOptions = {},
): IngestSource {
  switch (kind) {
    case 'mock':
      return new MockSource();
    case 'pcob':
      if (!options.pcobBaseUrl) {
        throw new Error('PCOB_BASE_URL is required when INGEST_SOURCE=pcob.');
      }
      return new PcobSource({
        baseUrl: options.pcobBaseUrl,
        pollMs: options.pcobPollMs,
        timeoutMs: options.pcobTimeoutMs,
        log: options.log,
      });
  }
}
