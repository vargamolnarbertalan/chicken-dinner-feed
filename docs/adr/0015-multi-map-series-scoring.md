# ADR-0015: Multi-map series scoring, persisted separately from the live match

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude
- **Supersedes / Superseded by:** —

## Context

`specs/SCORING-LOGIC-UPDATE.md` asks for tournament-wide, multi-map point tracking. Until now,
`MatchStore` tracked exactly one match in memory, reset on every `matchId` change or a `live → idle`
transition — deliberately "short memory" (ADR-0004: live telemetry is worthless once a match ends).
A tournament needs the opposite: points earned in map 1 must still count in map 5's standings, and
an operator must be able to review or correct a past map's result without re-running it.

## Decision

A new, separately persisted **series layer** sits on top of the existing per-match pipeline, rather
than folding series concerns into `MatchStore` itself.

- **`SeriesStore`** (`backend/src/state/series-store.ts`) owns `series.json` (ADR-0004's
  `JsonDocument` pattern) — a flat list of closed maps, each with its own per-team placement,
  eliminations, and points. `getSeriesTotals()`/`getSeriesHasAppeared()` are recomputed fresh from
  that list on every call, never cached or incremented, so editing or deleting a past map can never
  leave a stale aggregate anywhere.
- **`MatchStore` gained two additions, nothing else changed about its own job**: `setSeriesContext()`
  (a mutator, same style as the existing `setRuleset`/`setRoster`) feeds the series totals into
  `computeStandings`, and `projectAsEnded()` lets a manual "close this map now" reuse the exact same
  survivor-assignment logic a real `ended` transition already uses, instead of duplicating it.
- **PTS is now `seriesPointsSoFar + thisMap'sContribution`, recomputed from scratch on every
  snapshot** (never incremented). This map's own contribution is the usual kill points plus either a
  team's real placement points (once known) or a **guaranteed-minimum** placement — the worst position
  any currently-alive team could still finish in, given how many remain. If 9 teams started and 1 is
  out, none of the 8 survivors can finish worse than 8th, so all 8 are already credited 8th-place
  points on top of their series total, before any of them actually places.
- **Auto-close detection requires a signal to be stable for a couple of consecutive polls** before
  acting on it — both a new match id and the `ended` phase. `specs/PCOB-API.md` §7.6 documents the
  exact gap this closes ("a `GameID` that flaps... must not reset anything. Require the new id to be
  stable across a couple of polls") and nothing in the codebase guarded against it before now; the
  same reasoning applies to trusting `ended`, since the same signal can flap.
- **A manual "close now" and a delete action exist alongside auto-close and edit**, confirmed with the
  operator: auto-detection is not assumed reliable enough to be the only path, and a bogus
  auto-closed entry (an empty/near-empty "map" from a data glitch) needs to be removable, not just
  editable.
- **Resetting the series clears only the persisted history.** The currently running map's own
  elimination tracking in `MatchStore` is left untouched and becomes map 1 of the new series once it
  closes — confirmed with the operator rather than assumed, since the alternative (also wiping the
  live match's tracking) risks transiently un-eliminating an already-out team mid-broadcast.
- **A closed map stores only its own contribution, never a team's series-cumulative total.**
  `MatchStore`'s `Team.totalPoints` already includes the series total fed in via
  `setSeriesContext`; persisting that into the closed-map record would double-count it into every
  later map's series base the moment that map closed. `SeriesStore.persistClosedMap` deliberately
  recomputes `killPoints + placementPoints` from the projection's own fields rather than reading
  `totalPoints`.
- **Editing a closed map accepts only `placement`/`eliminations` per team, never a direct points
  override** — points are always re-derived from the scoring ruleset, the same rule that governs live
  scoring. The edited team set must exactly match the map's original teams (this corrects a wrong
  result; it does not redefine who played), and placements must form a clean 1..N permutation.
- **The overlay's rendering component needed no changes at all.** `TeamRow.tsx` already renders
  whatever `totalPoints`/`eliminations` it is given and greys out via `isEliminated`/`hasAppeared` —
  making `totalPoints` series-aware upstream was sufficient. `PROTOCOL_VERSION` did not need to bump:
  the WebSocket payload's shape is unchanged, only what feeds into `totalPoints` is.
- **`hasAppeared` keeps its existing, this-match-only meaning** on the `Team` object the overlay
  reads (its grey-out relies on that). The sort comparator alone additionally treats a team that
  appeared in an _earlier_ map of the series as equivalent to "appeared", so a bye or a data lag at
  the start of a new map does not drop a real, scoring team behind a roster slot that has never once
  appeared — this preserves an existing bug fix (a never-joined roster-padding team must not outrank
  a real team on a 0-0 tie) while extending it correctly across a series.
- **Sort tiebreak changed from team number to team name**, alphabetically, as the final key below PTS
  and this map's eliminations.
- **No `CONFIG_SCHEMA_VERSION` bump.** `series.json` is a brand-new document, not a change to any
  existing document's shape — bumping that shared version number for an unrelated document's change
  is exactly what re-triggered every other document's migration and corrupted `overlay-instances.json`
  earlier in this project's history (see the hardening note in ADR-0009's history). `series.json`
  uses `migrateSchemaVersionOnly`, the same as `scoring.json`/`custom-fonts.json`.

## Consequences

### Positive

- Persisted history survives a backend restart mid-series; only the currently-running map's start
  time is lost on a restart (modelled as `startedAt: null` — honest rather than guessed).
- The "recompute, never accumulate" rule applied uniformly (live guaranteed-minimum, series totals,
  and closed-map edits) means no code path can silently double-count or drift.
- Reusing `resolvePlacements`'s existing survivor-assignment logic for a manual close means there is
  exactly one implementation of "how do the remaining teams get ranked", not two.

### Negative / costs accepted

- The auto-close stability window (2 polls, ~1-2 seconds at the default poll interval) is a real,
  accepted delay between a match actually ending and it being recorded — traded for not
  double-closing or misfiring on a flapped signal.
- `SeriesStore` and `MatchStore` are two separate stores that have to be kept in sync by `app.ts`
  (`setSeriesContext` after every series change). This is more wiring than folding series state
  directly into `MatchStore`, accepted because it keeps `MatchStore`'s own job — this match, in
  memory only — unchanged and independently testable.

### Neutral

- Map name (Erangel, Miramar, ...) is modelled as nullable and stays null in practice — the PCOB API
  exposes no such field today (checked against every field alias in `payload.ts` and both vendor
  documents). No shape change needed if a future API version adds one.

## Alternatives considered

**Fold series totals directly into `MatchStore`, no separate store.** Rejected: `MatchStore`'s own
documented job is "this match, in memory only, worthless once it ends" — persisting a series history
inside it would have contradicted its own reason for existing and made it harder to test either
concern in isolation.

**Store each team's series-cumulative total as a running counter, incremented on close.** Rejected:
the spec's own "recompute, don't accumulate" principle exists specifically to prevent a class of
double-counting bug; a running counter reintroduces exactly the risk that principle is there to avoid,
and cannot be corrected cleanly if a past map is later edited or deleted.

**Auto-close on any signal loss (ingest goes idle/disconnected), not just `phase: 'ended'`.**
Rejected: a transient disconnect that reconnects moments later would wrongly freeze a map's result.
The manual "close now" button exists precisely to cover the case where the real `ended` signal never
arrives.

## Amended 2026-08-30 — automatic closing removed, live, mid-tournament

Automatic closing on `phase: 'ended'` was decided above on the assumption that `FinishedStartTime`
and `isInGame` reset per match, per `specs/PCOB-API.md` §7.6. Both assumptions failed on the same
real tournament match this feature ran against for the first time, in two different ways:

- Warmup-island PvP (a real, playable pre-drop area) tripped the round-started fallback signal
  (`kills > 0`/dead/knocked), which made `phase` read `ended` for a lobby that had not dropped yet —
  closing a fabricated map, full placement table, real points, out of a round nobody had played.
- After that was fixed, `phase` locked to `ended` a second time — apparently via a `FinishedStartTime`
  that did not clear — while 11 of 13 teams were still fighting. Every alive team was immediately
  handed a full, final placement on air, live: `resolvePlacements('ended')` treats every present team
  without a decided placement as a survivor and ranks it, the instant phase reads `ended`, regardless
  of whether the round has anywhere near actually concluded.

The second failure is the one that forced the decision here: it does not only threaten the auto-close
feature, it corrupts the **live overlay's own standings** for as long as phase misreads `ended` —
independent of whether closing is automatic or manual. A defensive gate was added regardless
(`derivePhase` now also requires `standingTeamCount <= 1` — the literal definition of a battle royale
round actually having concluded — before honoring either signal), but with two upstream signals now
each independently demonstrated unreliable on the very first live match, and no third one to
cross-check against, automatic closing itself is removed rather than patched a second time under the
same pressure that produced the first patch.

**Closing a map is now always an explicit operator action** — `POST /series/close-map`, unchanged in
every other respect (still forces `projectAsEnded()`'s survivor resolution, still refuses to fire
during warmup or with no match running, still refuses a second close of the same match). Automatic
match-_start_ detection (a new `GameID`) is kept: nothing failed there tonight, it is a narrower claim
than "the round has ended", and `MatchStore` already depends on it for resetting elimination tracking
independent of anything in this file.

**Consequence accepted, not yet mitigated in code:** if the operator forgets to close before the next
`GameID` appears, `MatchStore.resetMatch()` discards the finished map's elimination tracking with no
automatic recovery — there is no longer an automatic backstop. For tonight this was covered by an
external snapshot log (polling `/api/series` every 2s to a file) and a live reminder once
`standingTeamCount` reaches 1, specifically so a forgotten close could be reconstructed with "Add map
by hand" from the last good snapshot. Whether that deserves becoming a real, in-app feature — a
warning banner, or a short grace window before `resetMatch()` discards anything — is open; see
Revisit when.

## Amended again, same session — automatic closing reinstated on a different signal

Minutes after the amendment above, with the same match still running: the operator asked whether
`standingTeamCount <= 1` — a fact about the actual player data, checked directly — was solid enough
to re-enable automatic closing, given the amendment's own new phase-gate already required exactly
that condition. It is: unlike `isInGame`/`FinishedStartTime`, `standingTeamCount` is derived from
player `liveState` alone, is the literal definition of a battle royale round having concluded (WWCD),
and cannot read `<= 1` during warmup — no team can ever count as not-standing while `inWarmup` is
true (`standings.ts`'s own fix from earlier the same night). Reinstated as `shouldAutoCloseNow`,
checked alongside `observeMatch` on every ingest update: two-consecutive-poll stability, same
protection as a new match id gets, then a close using `MatchStore.projectAsEnded()` — the exact same
resolution manual close already uses, so there remains exactly one implementation of "how the last
team gets its placement." `phase` itself is not consulted by this check at all, so neither of
tonight's two failures can reach it. The manual button stays, as the explicit backup the operator
asked for, and is what covers everything this signal cannot: a round that ends in some way that
never drives `standingTeamCount` to exactly 1 (e.g., a stopped scrim), or any future case not yet
seen. Verified against the built store before redeploying, mid-match: a normal 4→1 death sequence
closes exactly once with correct placements, a one-tick glitch back up to full does not, warmup does
not, and a match already closed does not fire again.

## Revisit when

- The PCOB API ever exposes which map is being played — `mapName` is already modelled, nothing else
  needs to change.
- A tournament format needs something other than "every map counts equally toward one flat total"
  (best-of-N drops, weighted maps, etc.) — out of scope for this decision.
- An operator forgetting to close before the next `GameID` appears turns out to happen often enough
  in practice to warrant an in-app safeguard (a warning banner, a short grace window) rather than an
  external snapshot log — see the amendment above.
- A confirmed `getallinfo` capture answers whether `isInGame`/`GameID` are already set during warmup,
  or whether `FinishedStartTime` genuinely never clears — either would let automatic closing be
  reconsidered on firmer evidence than tonight's.
