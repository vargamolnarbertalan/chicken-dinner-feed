/**
 * `@cdf/shared` — the single source of truth for every shape that crosses a boundary.
 *
 * Per ADR-0005, the Zod schemas defined here are the one definition behind four consumers:
 *   1. backend request/response validation (Fastify + fastify-type-provider-zod),
 *   2. the generated OpenAPI document,
 *   3. persistence validation on read and write (ADR-0004),
 *   4. frontend types and client-side parsing of WebSocket messages (ADR-0007).
 *
 * Rules for this package:
 *   - schemas and inferred types only — no business logic;
 *   - no Node-only and no DOM-only APIs, since both backend and browser import it;
 *   - it must never import from `@cdf/backend` or `@cdf/frontend`.
 *
 * The domain model, config documents and protocol envelope land here as they are designed. The
 * domain model deliberately does not mirror the PCOB API — see ADR-0006 and specs/PCOB-FINDINGS.md.
 */

export { PROTOCOL_VERSION, CONFIG_SCHEMA_VERSION } from './versions.js';
