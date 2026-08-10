# Progression

The running record of what is done, what is next, and what is blocked. Required by
`specs/APP-PLAN.md`. Update it in the same commit as the work it describes.

**Last updated:** 2026-08-09 · **Version:** 0.1.0 · **Phase:** scaffold · **Client:** Esport1 (Zsófia Berze)

---

## Decisions made

Every architectural decision is recorded in [`adr/`](adr/README.md) with its full context, costs and
rejected alternatives. Summary of what is now settled:

| #                                                          | Decision                                                                     | Notes                                                                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [0001](adr/0001-local-windows-bundle-over-cloud-stack.md)  | Local Windows all-in-one bundle, **not** a Docker/VPS stack                  | Resolved the plan's central open question. Driven by the discovery that the PCOB API is a local process |
| [0002](adr/0002-node-typescript-fastify-backend.md)        | Node 22 + TypeScript + Fastify 5                                             | Replaces the plan's Django Ninja proposal; OpenAPI/Swagger is preserved                                 |
| [0003](adr/0003-react-vite-tailwind-shadcn-frontend.md)    | React 19 + Vite 8 + Tailwind 4 + shadcn/ui, Motion, Zustand, TanStack Router | As the plan proposed, with the supporting libraries chosen                                              |
| [0004](adr/0004-json-file-persistence.md)                  | JSON files behind a repository layer, no database                            | Atomic writes, schema-validated, versioned                                                              |
| [0005](adr/0005-monorepo-with-shared-contracts.md)         | npm workspaces: `shared` / `backend` / `frontend`                            | `shared` is added to the layout the plan prescribed                                                     |
| [0006](adr/0006-pcob-ingestion-adapter-boundary.md)        | PCOB isolated behind an ingestion adapter; mock source first                 | The response to the blocked API schema                                                                  |
| [0007](adr/0007-websocket-state-fanout.md)                 | Full versioned state snapshots over WebSocket                                | Not deltas; change-detected server-side                                                                 |
| [0008](adr/0008-admin-as-protected-frontend-route.md)      | Admin is a route in the frontend app                                         | As the plan proposed. No auth in the POC; loopback binding is the control                               |
| [0009](adr/0009-git-workflow-and-release-process.md)       | feat → develop → main, conventional commits, tagged bundle ZIP               | As the plan prescribed                                                                                  |
| [0010](adr/0010-poll-the-pcob-http-api.md)                 | Poll the PCOB HTTP API on `127.0.0.1:10086`                                  | Transport resolved by the client thread, not by the schema document                                     |
| [0011](adr/0011-resolution-independent-overlay-scaling.md) | Overlays scale uniformly from a fixed 1920×1080 design canvas                | Answers the contractual FullHD / 1440p / 4K requirement                                                 |

### Decisions resolved 2026-08-09

- **Admin scope — `specs/APP-PLAN.md` is the source of truth**, not the narrower quoted scope. We
  build the fuller admin: sizes, placement, animations, multiple overlay types and instances, on top
  of the quoted colours and fonts. **The live overlay preview is downgraded to nice-to-have**, not a
  must-have.
  _Note:_ this does not weaken [ADR-0008](adr/0008-admin-as-protected-frontend-route.md). Admin-as-a-route
  was chosen partly so the preview would be the real overlay rather than a lookalike — and because
  that decision makes the preview nearly free, we will likely get it anyway. It simply stops being
  something to spend effort defending if it turns out awkward.
- **Resolution priority — 1080p is the bar.** 1440p and 4K stay contractual and are correct by
  construction under [ADR-0011](adr/0011-resolution-independent-overlay-scaling.md), but no
  significant effort goes into perfecting them yet.
- **No delivery-date constraint.** Build now; the work is wanted now. Scheduling is not a factor in
  prioritisation.

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

## Done — round 1.1 (2026-08-09): client thread incorporated

`specs/PCOB_Tool_fejlesztes_thread.md` added and analysed. Four material changes:

- **Transport resolved.** The PCOB API is HTTP + JSON on `http://localhost:10086`, endpoint
  `gettotalplayerlist`. Recorded as [ADR-0010](adr/0010-poll-the-pcob-http-api.md); the blocker
  below is downgraded from red to partial.
- **New contractual requirement:** the overlay must support FullHD, 1440p and 4K dynamically. This
  was in the quote but not in `APP-PLAN.md`. Recorded as
  [ADR-0011](adr/0011-resolution-independent-overlay-scaling.md) and added to the plan.
- **Scope discrepancy surfaced** between the quoted scope (colours + fonts) and the planned admin.
  Raised under open decisions rather than silently resolved.
- **The access chain is now documented** — OPENID → publisher whitelist → API Enable → `launch.bat`.
  Reflected in both user guides, because it is the most likely cause of "no data".

---

## Done — round 2, part 1 (2026-08-09): the live pipeline

The backend half of the vertical slice. Nothing here needed the blocked API schema.

- **Domain model in `shared/`** — `Player`, `Team`, `MatchState`, `IngestStatus`, the `LiveSnapshot`
  and the WebSocket envelope. Deliberately **not** a mirror of the PCOB payload: player state is our
  own four-value vocabulary (`alive`/`knocked`/`dead`/`unknown`), and `unknown` exists so a player
  we have not heard about is never rendered as dead.
- **Scoring engine** — placement points table plus points per elimination, defaulting to the
  standard PUBG Mobile table (10/6/5/4/3/2/1/1, 1 per kill). Placement points are awarded only once
  a team is actually out, never while it is still playing. Covered by unit tests.
- **`MatchStore`** — holds the match in memory and owns the **elimination order**, which is the only
  thing here that cannot be recomputed: a team's placement depends on _when_ it went out, and no
  single ingest update contains that.
- **`MockSource`** — a deterministic simulated match: sixteen teams, engagements, knocks, revives,
  bleed-out, eliminations, and phase transitions. Tuned so a full arc runs in **~60 seconds**
  instead of a real match's 25–30 minutes, because waiting ten minutes to see a rank change animate
  makes overlay work impossible.
- **`LiveHub`** — WebSocket fan-out with snapshot-on-connect, coalescing, and change detection
  against the rendered projection. `ingest.lastUpdateAt` is excluded from the change key on purpose:
  it advances on every poll, so including it would make every poll a broadcast and defeat the whole
  mechanism.
- Wired end to end: `/ws/live`, adapter → store → hub → sockets, started after the port opens.

**Verified by running it:** a full mock match to completion over the real WebSocket — 16 teams
reduced to 1 in ~57 s, with the winner scoring 25 points (10 placement + 15 eliminations), correct
ranking throughout, and knocks and revives visible in the stream of snapshots. Tests are written but
run by CI, per the project's manual-test policy.

---

## Done — round 2, part 2 (2026-08-10): the overlay is visible

The first slice you can actually watch.

- **Leaderboard overlay** reproducing `specs/example.png` — rank, logo slot, short name, per-player
  health bars coloured by live state, points, eliminations, legend. Health drains over ~1.6 s
  between the 2 s data points so it reads as continuous; colour changes snap, because a knock is an
  event and fading it would look like lag. Rank changes animate as physical row movement.
- **Resolution independence** implemented per [ADR-0011](adr/0011-resolution-independent-overlay-scaling.md):
  a `--overlay-unit` custom property converts design-canvas pixels to real ones. Verified by
  screenshot at 1080p and 4K — the panel occupies an identical 19% of width at both.
- **Reconnecting WebSocket client** with exponential backoff and jitter, schema validation on every
  message, and a visible error rather than partial rendering on a protocol mismatch. Written for a
  page nobody is watching: it may outlive backend restarts and has no user to press refresh.
- **Stream Deck control** ([ADR-0012](adr/0012-http-overlay-control-for-stream-decks.md)) — the new
  requirement. Visibility is server-owned state, changed over plain HTTP and pushed per instance
  over WebSocket.

**Verified by running it:** control endpoints exercised as Companion would (`GET`), a full
hide/show/show cycle over a live socket, and screenshots at 1080p, 4K and hidden. A repeated `show`
correctly produces no message and no flicker; a page loaded while hidden renders nothing rather than
flashing the overlay on air.

---

## Next — round 2, part 3

1. **Persistence layer** — repository with atomic writes and schema validation; overlay instances,
   team roster and scoring ruleset as documents. Replaces the in-memory default roster and turns
   overlay ids into real entities. _(ADR-0004)_
2. **Admin** — instance CRUD, appearance settings bound to CSS custom properties, show/hide
   animation controls, scoring ruleset editing. Live preview is nice-to-have. _(ADR-0008)_
3. **Team logos** — resolve and serve them, replacing the placeholder squares.
4. **`PcobSource`** — the real HTTP adapter, once a response has been captured. _(ADR-0010)_
5. **Release workflow end to end** — cut `v0.2.0`, verify the bundle ZIP unpacks and runs on a clean
   Windows machine with only Node installed.

### Backlog

- **Post-match export** (final standings as CSV or a sheet-ready table). The client performs exactly
  this by hand today — save JSON, convert to CSV, paste into a Google Sheet. High value per unit of
  effort. _(`specs/PCOB-FINDINGS.md` §6)_
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

### 🟠 PCOB API payload shape (downgraded from 🔴 on 2026-08-09)

The client thread answered transport, host and port — HTTP + JSON on `127.0.0.1:10086`. What remains
unknown is the **payload shape** and **which route serves live in-match data**. `gettotalplayerlist`
is described as post-match, and the client states they do not know how the live table works either.

Two independent ways to unblock, and the cheaper one does not involve the restricted document:

1. **🟡 Capture one real response.** With a PCOB client running, "API Enable" ticked and
   `launch.bat` open, probe port 10086 — `GET /`, `GET /gettotalplayerlist`, and a few guessed
   sibling routes — and save one response body. A single payload would settle field names, nesting,
   `LiveState` values and how teams and players are keyed.
   **Status (2026-08-09): standing to-do, not currently actionable.** The PCOB client itself can
   probably be started, but we have no way into a live PUBG Mobile match yet, and the API only
   produces data inside one. Do this at the first opportunity — a rehearsal room would be enough,
   it does not need a real tournament.
2. **🔴 The schema document.**
   `docs.google.com/spreadsheets/d/1__DWeOyhrNs4PdXs9EoWwXdylU-CMICOQ-yNpw3Ag34` still returns
   **HTTP 401**; access requested by the client on 2026-08-09, no committed date. It would
   additionally list endpoints nobody has thought to probe.

**Not blocking round 2.** ADR-0006 puts everything behind an adapter and builds the mock source
first, so the domain model, overlay, scoring and admin can all be finished and demonstrated without
it. Only `PcobSource` waits — and when real data arrives, the first task is validating the domain
model against it rather than assuming the mock was right.

### Lower priority

- The _PCOB update note_ and _account application_ Google Docs are unverified; likely operator-only.
- No access to a live PCOB client for integration testing yet. The first real-data session should be
  scheduled as a milestone, not treated as a formality — and it is now also the cheapest way to
  unblock the payload question above.
