# Progression

The running record of what is done, what is next, and what is blocked. Required by
`specs/APP-PLAN.md`. Update it in the same commit as the work it describes.

**Last updated:** 2026-08-09 · **Version:** 0.1.0 · **Phase:** scaffold

---

## Decisions made

Every architectural decision is recorded in [`adr/`](adr/README.md) with its full context, costs and
rejected alternatives. Summary of what is now settled:

| #                                                         | Decision                                                                     | Notes                                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [0001](adr/0001-local-windows-bundle-over-cloud-stack.md) | Local Windows all-in-one bundle, **not** a Docker/VPS stack                  | Resolved the plan's central open question. Driven by the discovery that the PCOB API is a local process |
| [0002](adr/0002-node-typescript-fastify-backend.md)       | Node 22 + TypeScript + Fastify 5                                             | Replaces the plan's Django Ninja proposal; OpenAPI/Swagger is preserved                                 |
| [0003](adr/0003-react-vite-tailwind-shadcn-frontend.md)   | React 19 + Vite 8 + Tailwind 4 + shadcn/ui, Motion, Zustand, TanStack Router | As the plan proposed, with the supporting libraries chosen                                              |
| [0004](adr/0004-json-file-persistence.md)                 | JSON files behind a repository layer, no database                            | Atomic writes, schema-validated, versioned                                                              |
| [0005](adr/0005-monorepo-with-shared-contracts.md)        | npm workspaces: `shared` / `backend` / `frontend`                            | `shared` is added to the layout the plan prescribed                                                     |
| [0006](adr/0006-pcob-ingestion-adapter-boundary.md)       | PCOB isolated behind an ingestion adapter; mock source first                 | The response to the blocked API schema                                                                  |
| [0007](adr/0007-websocket-state-fanout.md)                | Full versioned state snapshots over WebSocket                                | Not deltas; change-detected server-side                                                                 |
| [0008](adr/0008-admin-as-protected-frontend-route.md)     | Admin is a route in the frontend app                                         | As the plan proposed. No auth in the POC; loopback binding is the control                               |
| [0009](adr/0009-git-workflow-and-release-process.md)      | feat → develop → main, conventional commits, tagged bundle ZIP               | As the plan prescribed                                                                                  |

### Decisions still open

- **Overlay type registry shape** — how a new overlay type declares its settings schema so the admin
  can render a form for it generically. Deferred until there are two overlay types to generalise
  from; guessing now would be premature abstraction.
- **Scoring ruleset format** — placement points table plus points per elimination is certain
  (see below); whether it needs per-stage or per-match-day variants is not yet known.
- **Team logo storage** — upload through the admin, or point at an existing folder? The PCOB
  `TeamLogoAndColor.ini` convention (`001.png` … `025.png` at 4 resolutions) is a strong argument for
  reusing the operator's existing directory. See `specs/PCOB-FINDINGS.md` §3.

---

## Done — round 1 (2026-08-09)

**Discovery**

- Extracted and analysed the 22-page PCOB guideline, including its external links, into
  [`specs/PCOB-FINDINGS.md`](../specs/PCOB-FINDINGS.md).
- Recovered the _PCOB API updated rules_ sheet: field groups, the ~2 s push cadence, and the trap
  that `PlayerAfterMatchAPI` fields read `0` for the whole match.
- **Scoping finding:** points and ranking are **not** provided by the API. A configurable scoring
  ruleset is required feature work, not a detail.

**Foundation**

- Repository layout per the plan, plus `shared/` and `docs/`.
- npm workspaces monorepo; single `npm install` at the root.
- `shared/` — `@cdf/shared` builds, exports protocol and config schema versions.
- `backend/` — Fastify app with config validation, structured logging, CORS restricted to loopback,
  WebSocket plugin registered, static hosting of the built frontend with SPA fallback, and
  OpenAPI/Swagger UI generated from Zod. `.env.example` documents every setting.
- `frontend/` — Vite + React + TypeScript, Tailwind v4, shadcn/ui configured (`components.json`,
  `cn()` helper), design tokens including overlay and player-state colours, `@/*` path alias,
  dev proxy to the backend.
- `install-dependencies.bat` and `startup.bat`, both with bilingual operator-facing errors,
  Node version checking, port-conflict detection, and browser launch gated on `/api/health`.
- Nine ADRs, README, EN + HU user guides, this file.
- Git: `main` / `develop`, conventional commits, PR template, release workflow.

**Verified working:** `npm install` → `npm run build` → `npm start` produces a running server;
`/api/health` returns the shared `PROTOCOL_VERSION`, `/admin` serves the SPA, `/api/docs` serves
generated OpenAPI, unknown `/api/*` paths return JSON 404s.

---

## Next — round 2

Ordered so that each step is demonstrable on its own.

1. **Domain model in `shared/`** — Zod schemas for match state, team, player, live state, plus the
   WebSocket envelope. This is the contract everything else is written against. _(ADR-0005, 0006)_
2. **Mock ingestion source** — a scripted match replay driving the adapter interface. Unblocks all
   downstream work and doubles as the rehearsal/demo mode. _(ADR-0006)_
3. **State store + WebSocket fan-out** — snapshot on connect, change detection against the rendered
   projection, coalescing. _(ADR-0007)_
4. **Leaderboard overlay** — reproduce `specs/example.png`: rank, logo, short name, per-player health
   bars coloured by live state, points, eliminations. Animate health, knocks, deaths and reordering.
   _(ADR-0003)_
5. **Scoring engine** — configurable placement points table and points per elimination, computed
   backend-side. Needed before the PTS column means anything.
6. **Persistence layer** — repository with atomic writes and schema validation; overlay instances,
   team roster and scoring ruleset as documents. _(ADR-0004)_
7. **Admin** — instance CRUD, appearance settings bound to CSS custom properties, show/hide animation
   controls, live preview rendering the real overlay component. _(ADR-0008)_
8. **Release workflow end to end** — cut `v0.2.0`, verify the bundle ZIP unpacks and runs on a clean
   Windows machine with only Node installed.

### Backlog

- Import an existing `TeamLogoAndColor.ini` to bootstrap the team roster in one click — cheap, and
  saves an operator retyping 16–25 teams. _(`specs/PCOB-FINDINGS.md` §3)_
- Startup lock file so two backends cannot share one `data/` directory. _(ADR-0004)_
- Lazy-load the admin route tree so overlay pages do not parse admin JavaScript. _(ADR-0008)_
- Performance check of the real overlay on a broadcast machine — the known risk in ADR-0003.
- Additional overlay types (minimap using `Location`, damage leaderboard using `Damage`).
- Optional shared passphrase for `/admin`, only if a setup ever exposes the port. Not a security
  boundary. _(ADR-0008)_

---

## Blocked

### 🔴 PCOB API schema document is not accessible

The spreadsheet linked from section 6 of the guideline
(`docs.google.com/spreadsheets/d/1__DWeOyhrNs4PdXs9EoWwXdylU-CMICOQ-yNpw3Ag34`) returns **HTTP 401**
to unauthenticated access. CSV export, `gviz` and `htmlview` endpoints were all tried.

**Unknown until it is available:** transport (WebSocket / TCP / HTTP / file), host and port, message
envelope, field naming and nesting, `LiveState` enum values, how players and teams are keyed, and
whether match start/end is signalled.

**Needed:** an export of that sheet, or read access for an account that can fetch it.

**Not blocking round 2.** ADR-0006 puts everything behind an adapter and builds the mock source
first, so the overlay, scoring and admin can all be finished and demonstrated without it. Only the
real `PcobSource` waits — and when the document arrives, the first task is validating the domain
model against it rather than assuming the mock was right.

### Lower priority

- The _PCOB update note_ and _account application_ Google Docs are unverified; likely operator-only.
- No access to a live PCOB client for integration testing yet. The first real-data session should be
  scheduled as a milestone, not treated as a formality.
