import type { IngestSourceKind } from '@cdf/shared';
import { MockSource } from './mock-source.js';
import type { IngestSource } from './source.js';

export type { IngestPlayer, IngestSource, IngestSourceEvents, IngestUpdate } from './source.js';
export { MockSource } from './mock-source.js';

/**
 * The one place that knows which adapter implementation exists.
 *
 * `pcob` is not implemented yet: the transport is known (HTTP on 127.0.0.1:10086, ADR-0010) but the
 * payload shape and the live endpoint are not, and building against a guessed payload would produce
 * something that looks finished and is wrong. Failing loudly here is better than silently falling
 * back to mock data during a broadcast.
 */
export function createIngestSource(kind: IngestSourceKind): IngestSource {
  switch (kind) {
    case 'mock':
      return new MockSource();
    case 'pcob':
      throw new Error(
        'The PCOB ingestion adapter is not implemented yet. The API payload shape is still ' +
          'unknown — see specs/PCOB-FINDINGS.md "Open questions". Set INGEST_SOURCE=mock for now.',
      );
  }
}
