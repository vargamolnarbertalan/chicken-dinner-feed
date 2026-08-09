# ADR-0002: Node.js + TypeScript + Fastify for the backend

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

`specs/APP-PLAN.md` proposed Django Ninja with OpenAPI/Swagger generation, while explicitly
inviting alternatives.

[ADR-0001](0001-local-windows-bundle-over-cloud-stack.md) changed the constraints that were
implicit in that proposal. The backend now has to:

- start fast and reliably from a double-clicked `.bat` file on a non-developer's Windows machine;
- hold live match state in memory and fan it out over WebSockets at low latency;
- persist only small JSON configuration documents — no relational data, no migrations
  ([ADR-0004](0004-json-file-persistence.md));
- be installable by a single dependency step that a broadcast operator can run.

Django brings an ORM, a migration system and a settings framework we would carry without using,
and real-time delivery requires adding Channels and an ASGI server on top. The frontend is
TypeScript regardless.

## Decision

The backend is **Node.js 22 + TypeScript, built on Fastify 5**, with:

- `@fastify/websocket` for the live push channel to overlays and admin
  ([ADR-0007](0007-websocket-state-fanout.md));
- `@fastify/static` to serve the built frontend from the same process and port, so the bundle is
  a single service;
- `@fastify/swagger` + `@fastify/swagger-ui` with `fastify-type-provider-zod` so the OpenAPI
  document is **generated from the same Zod schemas** used for runtime validation and for the
  frontend's types ([ADR-0005](0005-monorepo-with-shared-contracts.md)) — this preserves the
  Swagger/OpenAPI benefit that motivated the Django Ninja proposal;
- `pino` for structured logging.

## Consequences

### Positive

- **One language and one toolchain across the stack.** `install-dependencies.bat` needs Node only —
  no Python runtime, no virtualenv, no C-extension build step on Windows.
- Types are shared with the frontend with zero code generation and no drift.
- Cold start is ~1s, which matters when the entry point is a batch file before a live show.
- Fastify's WebSocket and static-file support are first-party and well-trodden.
- OpenAPI/Swagger is still produced, derived from the schemas rather than maintained separately.

### Negative / costs accepted

- We lose Python's data/analysis ecosystem, which the current scope does not need.
- Fastify gives less structure than a batteries-included framework; module boundaries have to be
  imposed by us rather than by the framework.
- Node's process model means one crash takes the whole service down — mitigated by making the
  ingestion adapter isolate and never propagate source errors.

### Neutral

- We chose **Fastify over NestJS** within the Node option. NestJS's dependency injection,
  decorators and module system pay off on large teams and large domains; here it would add a
  compile-time layer and a learning surface to a single-purpose localhost service. Fastify keeps
  startup fast and the code obvious. If the domain grows past what plugin-based composition handles
  cleanly, a NestJS migration is a rewrite of wiring, not of logic.

## Alternatives considered

**Django Ninja + Channels** (the original proposal). Rejected: it requires an ASGI stack for
real-time, expects a database for machinery we would not use, and adds a Python runtime to a
Windows bundle whose frontend already needs Node.

**NestJS.** Rejected as over-structured for the scope — see above.

**Plain `node:http` / Express.** Rejected: we would hand-roll validation, WebSocket handling and
OpenAPI, which is exactly what Fastify's plugin ecosystem gives us for free.

## Revisit when

- We need heavy statistical post-processing of match data where Python would genuinely win.
- The backend grows enough domains that plugin composition stops keeping it readable.
