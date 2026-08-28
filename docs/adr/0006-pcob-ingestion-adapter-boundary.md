# ADR-0006: Isolate the PCOB API behind an ingestion adapter

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

This is the one decision forced by an actual unknown rather than a preference.

The authoritative PCOB API schema document is **access-restricted**: the spreadsheet linked from
section 6 of the guideline returns HTTP 401 to unauthenticated access (CSV export, gviz and
htmlview endpoints all tried). See `specs/PCOB-FINDINGS.md` § _Open questions_. We therefore do not
know the transport, the port, the message envelope, the field names, the `LiveState` enum values,
or how players and teams are keyed.

What we _do_ know, from the reachable _PCOB API updated rules_ sheet:

- data is collected server-side every **2 seconds** and pushed only on change;
- three field groups exist — `PlayerBaseInfo`, `PlayerRealTimeAPI`, `PlayerAfterMatchAPI`;
- `PlayerAfterMatchAPI` fields are **`0` for the whole match** and only populated afterwards;
- the source can disappear mid-match (host disconnects, PCOB client crashes) and the operator may
  forget to press "API Enable" at all.

Also relevant: the PCOB client is versioned and updated independently of us (v4.3.0 as of March
2026; in production use as v4.5.0 by 2026-08-28), so its payload can change without warning.

Blocking all development until the schema arrives would waste the entire first round, since the
overlay, the scoring rules and the admin do not depend on the wire format — only on our own domain
model.

## Decision

All knowledge of the PCOB API lives behind a single **ingestion adapter** interface in the backend.
Everything downstream — state store, scoring, WebSocket fan-out, overlays, admin — consumes a
**normalised domain model that we define**, never raw PCOB payloads.

The adapter's contract:

- it emits normalised match-state updates and connection-status changes;
- it **owns reconnection** with backoff, and never propagates source failures as crashes;
- it **parses permissively**: unknown fields are ignored, missing optional fields do not throw, and
  a malformed message is logged and dropped rather than taking down the process;
- it reports a explicit connection state — `disconnected` / `connecting` / `connected` / `stale` —
  which the admin surfaces to the operator.

Two implementations are planned:

1. **`MockSource`** — replays scripted or recorded match data. Built **first**, so the whole
   pipeline is demonstrable end-to-end while the real schema is unavailable, and so overlay
   animation work has deterministic, repeatable input.
2. **`PcobSource`** — the real adapter, written once the schema document is obtained.

The domain model explicitly diverges from the API where the API is a poor fit:

- `PlayerAfterMatchAPI` fields are modelled as **"not yet available"**, never as `0`, so no overlay
  can silently display zeros mid-match;
- **points are computed by us** from a configurable scoring ruleset, because the API does not
  provide them (`specs/PCOB-FINDINGS.md` §2.4).
  > ⚠️ **Corrected 2026-08-28.** Ranking is not ours after all — a live capture confirmed PCOB's own
  > `rank` field is reliable placement data. `MatchStore` now takes it as the primary placement
  > source; our elimination-order tracking survives only as a fallback for a team believed
  > eliminated whose API rank has not caught up yet (`specs/PCOB-API.md` §6, §8). The rest of this
  > ADR's decision — the adapter boundary itself — is unaffected.
- the **last known good state is retained** when the source drops, with staleness exposed
  separately, so a disconnect does not blank the overlay on air.

## Consequences

### Positive

- Real progress is possible while the schema is blocked; only one file changes when it arrives.
- The mock source doubles as the test fixture and as the demo mode for rehearsals without a live
  game — likely valuable permanently, not just as a stopgap.
- A PCOB client update that changes the payload is contained in one module.
- Failure handling lives in exactly one place instead of being scattered.

### Negative / costs accepted

- A translation layer we would not need if the API happened to match our domain model.
- **The mock can encode wrong assumptions.** Building against imagined data risks a domain model
  that does not fit reality — e.g. if teams turn out not to be keyed by `TeamNo`. Mitigated by
  keeping the mock's shape deliberately close to the field names we _have_ confirmed, and by
  treating the first real-data session as a scheduled integration milestone, not a formality.
- Normalisation costs a little latency, irrelevant at 0.5 Hz.

### Neutral

- The adapter interface is where a future remote/tunnelled source would plug in.

## Alternatives considered

**Wait for the schema before writing any backend code.** Rejected: it blocks the entire first round
on a document we do not control, for no design benefit.

**Consume raw PCOB payloads directly in the state store and overlays.** Rejected: it couples the UI
to an undocumented third-party format that changes on someone else's release schedule, and spreads
null-handling for after-match fields across every component.

**Guess the wire format from community reverse-engineering and build the real adapter now.**
Rejected: unverifiable, and a wrong guess is more expensive than a mock because it looks finished.

## Revisit when

- ~~The API schema document becomes available~~ — happened 2026-08-17 (two vendor documents), then
  settled further by reading `ob.js` itself the same day (`specs/PCOB-API.md`).
- ~~The first live test against a real PCOB client reveals a mismatch~~ — happened 2026-08-28: no
  mismatch in the domain model, but it did surface that ranking, not just points, needed a decision
  (see the correction above).
