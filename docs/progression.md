# Progression

The running record of what is done, what is next, and what is blocked. Required by
`specs/APP-PLAN.md`. Update it in the same commit as the work it describes.

**Last updated:** 2026-09-01 · **Version:** 0.1.0 · **Phase:** feature build · **Client:** Esport1 (Zsófia Berze)

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

### Decisions resolved 2026-08-10

- **Controlling an unknown overlay id is now a 404**, not a silent success.
  [ADR-0012](adr/0012-http-overlay-control-for-stream-decks.md) accepted implicit instance creation
  only "while overlay instances are not yet persisted entities" and flagged it to revisit when they
  were. The persistence round made them real, so the control endpoints now check the configuration.
  Behind a stream deck, a 200 for an overlay that does not exist is indistinguishable from a broken
  button.

### Decisions still open

- **Overlay type registry shape** — how a new overlay type declares its settings schema so the admin
  can render a form for it generically. Deferred until there are two overlay types to generalise
  from; guessing now would be premature abstraction.
- **Scoring ruleset format** — placement points table plus points per elimination is certain
  (see below); whether it needs per-stage or per-match-day variants is not yet known.
- ~~**Team logo storage**~~ — resolved round 3, part 1: both. Upload through the admin, or import
  `TeamLogoAndColor.ini` in one click, which copies the logos it points at too.

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

## Done — round 2, part 3 (2026-08-10): persistence and the admin

The app is now configurable rather than hardcoded.

- **Persistence** ([ADR-0004](adr/0004-json-file-persistence.md)) — three JSON documents, split by
  aggregate so saving overlay appearance cannot corrupt the team roster. **Writes are atomic**
  (temp file → `fsync` → rename), because configuration is saved by someone who may be minutes from
  air on a machine that could lose power, and a truncated file would cost a whole tournament's
  setup. **Reads are schema-validated and fail loudly**, since hand-editing these files in Notepad
  is a supported workflow.
- **Config API** — overlay instances (create / update / delete), team roster, scoring ruleset.
  Guard rails return operator-language errors: duplicate ids, duplicate team numbers, and changing
  an instance id are all refused, the last because it would silently break every browser source and
  Companion button already pointing at it.
- **Admin UI** — instance list with create/duplicate/delete, appearance editor (placement, size,
  font, colours, animation, teams shown), team roster editor, scoring editor, and a connection
  indicator that says what to do rather than just showing a colour.
- **Live preview** — the _real_ overlay component, driven by real match data. Downgraded to
  nice-to-have and delivered anyway, because admin-as-a-route made it nearly free. Two modes: full
  canvas for placement, actual size for colour and legibility — the panel is under a fifth of the
  canvas, so one view cannot do both jobs.
- **Config reaches the live path immediately.** A scoring change recomputes the standings on air; an
  appearance change is pushed to open browser sources over the existing per-instance channel.
- **Tests owed from the last round paid off** — the control store and the atomic repository.

**Verified by running it:** config seeded on first start; duplicate id, duplicate team number and id
rename all rejected with readable messages; scoring changed from 1 to 5 points per elimination and
the standings updated live; an appearance colour saved in the admin arrived at an open overlay over
the socket.

---

## Done — round 3, part 1 (2026-08-10): team logos

- **Upload, preview and removal** per team, with the format identified from the file's own bytes
  rather than its name or declared type — both come from the client and are wrong often enough to
  matter. PNG, JPEG, WebP and SVG, capped at 2 MB. SVG is allowed deliberately: overlays run to 4K
  and a vector logo is the only kind that stays sharp there (ADR-0011).
- **Logo URLs carry a version**, so replacing a logo actually shows up in a browser source that has
  been open all day rather than being served from cache.
- **`TeamLogoAndColor.ini` import** — the cheap win flagged since round 1. It reads the file the
  observer already maintains for the PCOB client, and fills in every team number, name and logo in
  one step. It copies the logos the ini points at, and reports the paths it could not find rather
  than quietly skipping them. Replaces the roster rather than merging, because that file is the
  event's team list; the confirmation says so.
- Uploading links the logo into the roster immediately, without a separate save. An uploaded logo
  that is not used looks exactly like an upload that failed.

**Verified by running it:** a PNG and an SVG uploaded and rendered on the overlay; a text file
renamed `.png` rejected; path traversal on the logo route refused; a six-team ini imported with five
logos copied and one dead path reported.

---

## Done — round 3, part 2 (2026-08-10): custom fonts

- **Upload your own typeface** — TTF, OTF, WOFF, WOFF2 up to 8 MB, identified from the file's own
  bytes. Desktop `.ttf`/`.otf` are accepted rather than demanding web formats, because that is what a
  brand's font actually arrives as. The built-in choices stay.
- **A Fonts tab** that previews each font in itself, using overlay-like text: a family name says
  nothing about whether the digits read at broadcast size.
- **`@font-face` is injected live**, delivered on the same channel as the overlay configuration, so
  a font uploaded mid-setup reaches open browser sources without a reload.
- `font-display: block` rather than `swap`: swapping paints a fallback first and then flips, which on
  air is a visible flicker of the wrong typeface.
- Removing a font **leaves overlays using it alone** — they fall back to the system font, which is
  visible and correctable, rather than having their appearance silently rewritten.
- Protocol bumped to **v3**.

**Verified by running it:** a real TTF uploaded, served, applied to the overlay and confirmed loaded
via `document.fonts.check()`; a non-font rejected; the font removed and the overlay restored.

---

## Done — round 3, part 3 (2026-08-10): admin branding

- **Page titles.** Each overlay tab is titled with its own name, the admin with
  `Admin - PUBG overlays`. Checking a setup means opening several overlay tabs at once, and without
  distinct titles they are indistinguishable.
- **The app logo** in the admin header, and as the favicon. A 128 px copy is generated from the
  1.7 MB original rather than scaling that down in the browser for a 44 px slot.
- **Admin palette taken from the logo**, sampled with a script rather than eyeballed: gold
  `#f8d51a`, orange `#eb952f`, red `#e11911`, sky `#3ca7e9`, navy `#062542`, white `#efeff1`.
  Dark by default — this is read in a dim gallery beside a video wall.
- Text colours were **contrast-checked**: the logo's own red reaches only 3.96:1 on the page, so a
  lighter one at the same hue is used wherever something has to be read, and the mark's red is kept
  for solid fills.
- `color-scheme: dark` so native selects, sliders and scrollbars follow, scoped away from the
  overlay surface.

**Verified:** admin and two overlay tabs report the right titles; the overlay renders identically
before and after the restyle — the two palettes are independent and the admin's cannot reach the
broadcast.

---

## Done — round 3, part 4 (2026-08-10): the preview is the overlay

- **The preview is now an `<iframe>` of `/overlay/<id>`** — the same address a browser source uses,
  rendered at 1920×1080 and scaled optically. Identity by construction rather than by maintenance
  ([ADR-0013](adr/0013-preview-embeds-the-real-overlay.md)).
- **Show/hide animations now play in the preview**, including when triggered from a Stream Deck
  rather than from the admin — which is what makes expanding the animation settings worth doing.
- **Accepted cost:** the preview shows _saved_ settings, so editing no longer updates it as you
  type. Rehearsal happens on air, which is what the pre-broadcast test window is for.
- The overlay draws a chequerboard backdrop when its address carries `?preview=1`, because an
  embedded document still paints a canvas and `color-scheme` has no transparent value.

**Verified by running it:** an external `hide` (a plain HTTP call, as a Stream Deck makes) animated
the panel out of the preview mid-flight and removed it once the exit completed.

_Method note:_ a screenshot taken with Chromium's `--virtual-time-budget` showed the frame blank.
That was an artefact of the virtual clock with iframes, not a defect — real-time capture through the
DevTools protocol showed it rendering correctly. Worth remembering before chasing a bug that a
measurement invented.

---

## Done — round 3, part 5 (2026-08-10): animation options

- **Four types** — fade, wipe, slide, zoom. Wipe is a mask (`clip-path: inset()`), so the panel
  stays put and its text does not shift while it is revealed; slide moves the whole panel. Type and
  direction are stored separately, so adding a fifth type does not multiply the list by four.
- **Cross-fade is now a switch**, applied uniformly — switching it off on zoom leaves a pure zoom.
  One rule for every type beats a per-type exception.
- **Duration** 100–5000 ms in 50 ms steps; **row stagger** 10–500 ms in 5 ms steps.
- **Row animation** — rows fade in one after another once the panel has arrived, orchestrated by
  Motion's `when: 'beforeChildren'` plus `staggerChildren` rather than per-row delays. Rows hold
  their space and only change opacity, so the panel never resizes mid-animation.
- Reversing on hide is **its own switch, off by default**: sixteen rows at 100 ms would put more
  than a second between a director's key press and an empty screen.

**The migration is the part that mattered.** Changing the animation shape would have made four
existing overlays fail validation and stop the app on start. `schemaVersion` finally earns its
keep — documents are migrated _before_ validation and the upgrade is written back once. A first
attempt snapped durations to the slider's 50 ms grid, turning 880 ms into 900; corrected, because a
migration changes a document's shape, not an operator's settings.

**Verified by running it:** the real v1 config loaded and upgraded with every setting intact; each
of the four types sampled mid-flight in a browser (wipe showing `inset(0% 17% 0% 0%)`, zoom at
`scale(0.986)` with opacity untouched); and the row stagger observed as a clean staircase that
stays at zero until the panel has finished.

---

## Done — round 3, part 6 (2026-08-10): the admin stays reachable while scrolling

- **Header and tabs are sticky.** The connection indicator is what an operator glances at
  mid-broadcast, and it was no use only at the top of a long form.
- **Toolbar, preview and browser-source address became one sticky column.** Adjusting an animation
  at the bottom of the appearance editor now shows the result and offers Save without scrolling
  back. The sticky offset is measured from the chrome rather than hard-coded, because the header
  wraps on a narrow window. The column scrolls internally on a short viewport instead of being cut
  off.
- **Save is disabled until something changes**, and pulses while there are unsaved changes —
  including going quiet again when an edit is undone, which is why the comparison is structural
  rather than `JSON.stringify` (key order would make an unchanged object read as changed).
- The pulse is a **CSS** animation, so the existing reduced-motion rule neutralises it with no extra
  branch. The visible wording beside the button was dropped at the operator's request; the state
  lives in the button's accessible name and its `disabled` attribute instead, both of which
  assistive technology reads.
- The ripple is **two animations, not one**: the ring travels on a `linear` curve and the scale
  breathes on an ease-in-out. A single eased keyframe set expanded the ring inside the first third
  of the cycle and left the rest dead, which reads as a blink rather than a pulse.

**Verified in a browser:** after scrolling 2000 px the header sits at `top: 0` and the control
column stays near the top; editing the name enables the button, sets the pulse and shows "Unsaved
changes"; reverting the edit returns all three to their resting state.

---

## Done — round 3, part 7 (2026-08-14): `/feedback` for stream-deck buttons

`GET /feedback` returns one document a Companion button can read state out of: every overlay's
properties and visibility, data-feed health, match progress, and every address the app answers on.
_(ADR-0014)_

- **Overlays are keyed by id, not listed.** An array index silently repoints a button at a different
  overlay when an unrelated one is deleted — nothing fails, the button just becomes wrong.
- **The payload is a projection defined separately from the persisted config**, so the config schema
  stays free to change without breaking a stream deck built before a tournament. The cost is a
  second schema that must be kept in step; it is a deliberate trade against Hyrum's Law, given the
  consumer is hand-configured and rarely revisited.
- **Every condition worth a feedback has a boolean** — `isVisible`, `isReceivingData`, `isStale`,
  `hasConnectedSource`, `isLive` — rather than making an operator type a string comparison correctly
  from memory. Timestamps are published twice, as an epoch stamp and as seconds-ago.
- **`connectedSources` is the one genuinely new diagnostic**: it separates "hidden" from "showing
  into nothing because OBS was never pointed at it", which look identical on air. The admin's own
  preview is excluded — it connects over the same channel as a browser source, and counting it would
  always answer yes to the question the operator is asking. The preview now declares itself with
  `preview=1` on its WebSocket address, as it already did on its page address.
- **The same `CONTROL_TOKEN` guards it**, via one shared `controlTokenRejection` so the two surfaces
  cannot drift. The token is not embedded in the URLs the document hands out.
- URLs are built from the request's `Host`, so a response fetched from another machine is already
  written for that machine — validated against a conservative pattern rather than reflected.
- `APP_VERSION` became one constant; `/api/health` and `/feedback` were about to disagree.

**Verified against a running server:** the document parses, `hide` flips `isVisible` and populates
`secondsSinceChange`, two live browser sources count as 2 while a preview alongside them counts as
0, and with `CONTROL_TOKEN` set the endpoint answers 401 without it and 200 with it by either query
parameter or header.

---

## Done — round 4 (2026-08-18): the real PCOB adapter

`PcobSource` exists. Built without a live match, because reading the vendor's own API server settled
everything except what is inside the game's payload — see `specs/PCOB-API.md`.

- **Polls `getallinfo`, not the documented routes.** `ob.js` accepts match data at exactly one place,
  `POST /totalmessage`, which replaces `app.allInfo` wholesale; every documented `get*` route is a
  projection of that one object. `getallinfo` returns it whole, which makes it the only route
  carrying `GameID`, and means players and teams come from the same snapshot instead of two requests
  that could straddle an update. `isingame` is genuinely separate state, so that is the second call.
- **Tolerant reads inside, assertions outside.** The envelope keys are certain — they are string
  literals in `ob.js` and were confirmed by running it. The contents are not, because `ob.js` passes
  the game's payload through untouched. So field lookup is case-insensitive and alias-aware, and an
  unreadable field degrades to a default plus **one** log line naming it. Once per run, not once per
  poll: at 1 Hz the latter would bury the real message under thousands of copies.
- **Kills are a high-water mark.** What `killNum` does after a player dies is undocumented — it may
  hold, or reset with the figure moved to `killNumBeforeDie`, which the 1.5.0 sample does not even
  contain. Taking the maximum is monotonic under all of those. A team's ELIMS counting _down_ on air
  would be blamed on us.
- **Slots are assigned on first sight and frozen.** PCOB supplies no position within a team. Arrival
  order decides the layout; the id keeps it. A player missing from one response leaves their slot
  **empty** rather than letting teammates slide up and back down two seconds later.
- **`disconnected` is a real state now.** `PROTOCOL_VERSION` 4 → 5. It counts as standing — a
  disconnected player is not eliminated, and treating them as out would place their team early and
  award placement points irreversibly. In the overlay it borrows the dead colour at 45% opacity
  rather than claiming a fourth operator-configured token, and keeps its bar height, which is what
  separates it from a drained one.
- The mock now produces the occasional disconnect and reconnect, so that rendering can be seen at
  all before a tournament.

**Verified against the real `ob.js`** from the v4.3.0 package — the vendor's server, fed a snapshot
the way the game feeds it, with our app polling it as `INGEST_SOURCE=pcob`. `GameID` arrived as the
match id, `liveState: 6` rendered as `disconnected` and counted as standing, a wiped team took
placement 16, and `killNumBeforeDie` produced the right elimination total where `killNum` had reset
to zero.

**Proven 2026-08-28** — see round 5 below. The live game client spells its fields exactly as the
3.0.0 dictionary said, `rank` turned out to be real placement data, and `INGEST_SOURCE=pcob` is now
verified, not just built.

---

## Done — round 5 (2026-08-28): the first real live match, and what it changed

**The capture.** A real PCOB client (v4.5.0,
`Win64_Release4.5.0_No17_4.5.0.21320_Shipping_OB_Shelled`) watched a 1v1 test match end to end —
lobby, plane, a death by zone damage plus combat, match end, and a clean restart into a second match.
`docs/user/pcob-capture-guide.{en,hu}.md` were corrected against the real package layout in the same
session (a double-nested extraction folder and ~26 GB of duplicated split-archive volumes were a
one-time mistake, now documented as a trap to avoid; v4.5.0, unlike v4.3.0, genuinely needs `.pak`
patch files). Full findings: `specs/PCOB-API.md` §6, §8.

**What the capture confirmed:**

- `rank` populates **immediately at match end**, for every team, in the same poll `isingame` flips
  `false` — not post-match-only, and not needing a grace period.
- `playerKey` is stable for an entire match and changes on the next one.
- `killNumBeforeDie`, `teamName`, `bHasDied` all appear on the wire, every poll.
- Three previously undocumented fields exist: `PoisonTotalDamage`, `UseSelfRescueTime`,
  `UseEmergencyCallTime`. Ignored by design — no code change needed.

**What it changed, once real (not mocked) data hit the standings:**

- **Placement now trusts `rank`.** It was never actually read anywhere — despite a 2026-08-17
  decision to use it. `MatchStore.resolvePlacements` now takes a team's own `rank` as primary,
  falling back to elimination-order tracking only for a team believed out whose API rank has not
  caught up. ADR-0006 corrected accordingly.
- **A roster team that never joined a match no longer outranks one that did.** The 1v1 test used 2 of
  a 16-team default roster; the fallback placement math, previously sized off the full roster, put
  the API-confirmed 2nd-place team in 16th. New `Team.hasAppeared` (backed by `MatchStore`'s
  match-scoped `seenTeams`) fixes both the math and the display — present teams always sort first,
  and a never-present team renders visibly dimmer than even an eliminated one.
- **A team has one name, not two.** `name` + a derived `shortName` never matched the source data —
  the ini has a single `TeamName=` value per team. Collapsed to one `name` everywhere (schema,
  persistence, admin, overlay). A migration (`CONFIG_SCHEMA_VERSION` 2 → 3) carries an operator's
  existing roster forward, keeping whichever value actually rendered on air.
- **`/` now redirects to `/admin`.** The old placeholder homepage (a pre-admin signpost, literally
  commented as such) had no link to the admin at all — hit live tonight by opening the app fresh.
  Deleted rather than left unrouted.
- `PROTOCOL_VERSION` 5 → 6 (the `Team` wire shape changed).

**Verified live:** the whole fix chain (rank, `hasAppeared`, single team name) watched rendering
correctly on the `/overlay/teszt` browser source during and after a real match.

**One real gap found, not yet fixed:** `OverlayPage` shows a visible banner on a protocol-version
mismatch; `AdminPage` does not — a stale admin tab just stops updating silently (badges stuck,
buttons unresponsive) with no explanation on screen. Hit live tonight after this round's own
`PROTOCOL_VERSION` bump. Backlogged below.

---

## Done — round 6 (2026-08-28): the release pipeline, run for the first time

`docs/adr/0009-git-workflow-and-release-process.md` described a release workflow that had never
actually been exercised — no tag had ever been pushed. Running it for the first time on
`feat/release-pipeline` found real gaps; see the ADR's "Hardened 2026-08-28" section for the full
account. Summary:

- The release now **fails fast if the pushed tag disagrees with `package.json`**, across all four
  workspaces. `npm run version:set -- X.Y.Z` bumps all four in one step.
- The workflow **smoke-tests the assembled bundle** — `npm ci --omit=dev`, boot, `/api/health` — and
  **audits its shipped dependencies** (`npm audit --omit=dev --audit-level=high`), both before
  anything is published, not after.
- That smoke test caught a real bug on its first run: without `NODE_ENV=production`, the server
  crashes on its first log line (`pino-pretty` is a devDependency, correctly excluded from the
  bundle). `startup.bat` already sets this; the CI smoke test now does too, explicitly.
- `install-dependencies.bat` no longer reinstalls unconditionally on every run — it stamps the
  installed lockfile's hash and skips straight to "already up to date" when nothing changed, and
  reads its Node version floor from the bundle's own `package.json` rather than a hard-coded number.
- Added `CHANGELOG.md` (Keep a Changelog format) and a SHA-256 checksum published alongside the ZIP.

**Verified locally before trusting CI**, since nothing here had ever run: assembled a real bundle
from a fresh `npm run build`, ran `npm install --package-lock-only --omit=dev` and `npm ci
--omit=dev` inside it, booted it as `startup.bat` would, and confirmed `/api/health` responds —
reproducing the `NODE_ENV` bug in that process rather than discovering it from a failed release.

**Still open:** the actual `v0.1.0` tag has not been cut. That is next.

---

## Next

1. **Cut the first real release, `v0.1.0`** — now that the pipeline has been run and hardened once;
   verify the published bundle unpacks and runs on a clean Windows machine with only Node installed.
2. **Post-match export** — the workflow the client performs by hand today.
3. **Startup lock file** so two backends cannot share one `data/` directory. _(ADR-0004)_
4. **Admin-side protocol-mismatch banner** — found in round 5; `OverlayPage` already has one.

### Backlog

- **Post-match / per-map stat export**, scope still open. The client performs a version of this by
  hand today — save JSON, convert to CSV, paste into a Google Sheet — which is why final-standings
  CSV export was already flagged as high value per unit of effort. _(`specs/PCOB-FINDINGS.md` §6)_
  2026-09-01 raised widening this to a **per-map/stage summary**, not only the final post-match
  standings. **Needs product input before scoping**: which stats per map, one export per map vs. a
  combined multi-map sheet, format (CSV / sheet-ready table / other), and whether it exports live
  per-map data or only after each map ends.
- **Per-page sticky pin for a control element**, user-controlled. Two related mechanisms exist today,
  neither of which is this: `AdminPage`'s sidebar collapse is a show/hide toggle persisted globally
  per browser (`localStorage['cdf.admin.sidebar']`, not per subpage) — `frontend/src/pages/AdminPage.tsx:82-95`.
  `InstanceToolbar` (rename/save/on-air/delete) is already always-sticky while the appearance editor
  scrolls, but that is hardcoded, not something the operator can opt in or out of —
  `frontend/src/features/admin/InstanceToolbar.tsx`, rendered at `AdminPage.tsx:484-499`. What's
  missing is a per-subpage, user-toggleable "keep this control pinned/visible everywhere" setting.
  Needs a decision on where that preference lives (per page? one global switch?) before implementing.
- **Eliminated-team rows: dim vs. hide, as an operator choice.** `appearance.maxTeams` already caps
  the leaderboard at N rows (default 16, range 1–25), editable per overlay instance in
  `AppearanceEditor` — `shared/src/config/overlay-instance.ts:95,156`,
  `frontend/src/features/admin/AppearanceEditor.tsx:175-176`. What it does not do: an eliminated team
  still occupies a row, just dimmed — `frontend/src/components/overlay/TeamRow.tsx:40-46`, "Eliminated
  teams recede rather than disappear," a deliberate design choice, not a bug. Request 2026-09-01: an
  operator who only wants to show, say, 13 of 16 rows because the rest are already out on prior maps
  wants those rows gone, not grayed. **This reverses a decision already made once** — treat it as a
  conscious trade-off (e.g. a per-instance "dim eliminated" vs. "hide eliminated" toggle) rather than
  silently flipping the current default; confirm which broadcasts still want the dim behavior before
  changing it project-wide.
- **Measure end-to-end latency, game → PCOB → ingestion → overlay render, then reduce it if the
  numbers justify it.** No stage is currently instrumented with timestamps, so today there is only a
  design-time estimate, not a measurement: ADR-0010 accepted "up to ~1 s of added latency" against an
  assumed ~2 s upstream PCOB refresh cadence, as the trade-off for polling `PCOB_POLL_INTERVAL_MS`
  (default `1000`, configurable 200–10000 — `backend/src/config.ts:51`,
  `backend/src/ingest/pcob/pcob-source.ts:23,73`) instead of hammering the local API faster. On top of
  that: `LiveHub` recomputes a full `JSON.stringify` change-key on every poll tick and coalesces
  broadcasts with a 50 ms debounce before it sends (`backend/src/ws/live-hub.ts:93,209-226,271-274`) —
  cost currently unmeasured, and only likely to grow with match/team-list size. On the render side,
  reorder and value-change animations are deliberately slow enough to add to _perceived_ latency on
  top of data latency — team-row reorder up to 0.55 s (`frontend/src/components/overlay/TeamRow.tsx:32`),
  health-bar height animation up to 1.6 s (`frontend/src/components/overlay/AlivePlayerBars.tsx:86`).
  Before touching the poll rate or the coalesce/animation timings, thread a timestamp or trace id
  through ingestion → snapshot → WebSocket send → frontend receipt → paint, so any change is judged
  against a real number instead of ADR-0010's estimate — and note that lowering
  `PCOB_POLL_INTERVAL_MS` reopens that ADR's staleness-vs-request-load trade-off, not just a config
  tweak. Related to the broadcast-machine performance check below, but distinct: that one is about
  frontend rendering cost, this one is the whole pipeline's data latency.
- Startup lock file so two backends cannot share one `data/` directory. _(ADR-0004)_
- Lazy-load the admin route tree so overlay pages do not parse admin JavaScript. _(ADR-0008)_
- Performance check of the real overlay on a broadcast machine — the known risk in ADR-0003.
- Additional overlay types (minimap using `Location`, damage leaderboard using `Damage`).
- Optional shared passphrase for `/admin`, only if a setup ever exposes the port. Not a security
  boundary. _(ADR-0008)_
- Whether `rank` populates for an early-eliminated team while others keep playing (the 1v1 capture
  cannot distinguish this from "populates at whole-match end") — needs a ≥3-team match capture.
  _(`specs/PCOB-API.md` §6)_
