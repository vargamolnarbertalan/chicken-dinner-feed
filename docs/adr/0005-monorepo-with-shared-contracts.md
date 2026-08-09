# ADR-0005: npm-workspaces monorepo with a shared contracts package

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

Backend and frontend are both TypeScript ([ADR-0002](0002-node-typescript-fastify-backend.md),
[ADR-0003](0003-react-vite-tailwind-shadcn-frontend.md)) and ship together as one bundle
([ADR-0001](0001-local-windows-bundle-over-cloud-stack.md)). They exchange three kinds of data:

- the **live state snapshot** pushed over WebSocket ([ADR-0007](0007-websocket-state-fanout.md));
- **configuration documents** read and written through the admin REST API;
- **overlay settings** that the backend persists and the overlay renders.

The same shapes are also what the persistence layer validates on disk
([ADR-0004](0004-json-file-persistence.md)) and what the OpenAPI document describes. Four consumers
of one definition is exactly where drift happens.

`specs/APP-PLAN.md` prescribed a root with `specs`, `backend` and `frontend`. A third workspace is
a deliberate addition to that layout.

## Decision

A single repository with **npm workspaces**: `shared/`, `backend/`, `frontend/`.

`shared/` (`@cdf/shared`) is the **contract package** and the single source of truth for every
shape that crosses a boundary. It contains **Zod schemas** plus the types inferred from them, and
nothing else — no runtime dependencies on Node or the DOM, no business logic.

From those schemas we derive, rather than duplicate:

- backend request/response validation (Fastify + `fastify-type-provider-zod`);
- the generated OpenAPI document;
- persistence validation on read and write;
- frontend types and client-side parsing of WebSocket messages.

npm workspaces specifically — not pnpm, Turborepo or Nx — because npm ships with Node, and
`install-dependencies.bat` must work with nothing but a Node installation.

## Consequences

### Positive

- One definition, four consumers. A field rename fails to compile on both sides instead of failing
  in production during a live show.
- The WebSocket payload is validated on the client too, so a version mismatch between a stale
  browser source and a new backend surfaces as a clear error rather than as `undefined` in the UI.
- Backend and frontend versions can never diverge: they are released as one artifact.
- No extra tooling for a broadcast operator to install.

### Negative / costs accepted

- `shared/` must be built before the others; the root `build` script orders this explicitly.
- npm workspaces offer no task graph or caching. At three packages this is not worth a build tool.
- A monorepo makes it tempting to reach across package boundaries. `shared/` importing from
  `backend/` or `frontend/` must be treated as a defect.
- Zod schemas at module scope carry a small startup cost — negligible here, and paid once.

### Neutral

- The layout stays compatible with `specs/APP-PLAN.md`: `specs/`, `backend/` (with `.env` and
  `data/`), `frontend/` (with `public/images`, `public/fonts`), plus `shared/` and `docs/`.

## Alternatives considered

**Two independent repositories.** Rejected: shared types would have to be published to a registry or
copy-pasted, and the two halves could be released out of step — unacceptable when they ship as one
ZIP.

**One package, no workspaces.** Rejected: backend and frontend have genuinely different build
targets and dependency sets, and mixing them makes the frontend bundle vulnerable to accidentally
importing Node-only code.

**TypeScript types only, no Zod.** Rejected: types vanish at runtime. We need actual validation at
three boundaries — untrusted PCOB input, hand-editable JSON on disk, and HTTP requests.

**pnpm / Turborepo / Nx.** Rejected: added prerequisites for the operator and unjustified at this
size.

## Revisit when

- Build times become painful enough to want caching.
- A fourth deployable appears (for example a standalone ingestion agent, if
  [ADR-0001](0001-local-windows-bundle-over-cloud-stack.md) is ever reversed).
