# ADR-0007: Push state to overlays over WebSocket as versioned snapshots

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

The backend holds live match state and must deliver it to every open overlay browser source and to
the admin. `specs/APP-PLAN.md` requires that _every_ change is animated — health drops, knocks,
deaths, respawns, rank reordering.

Relevant facts from `specs/PCOB-FINDINGS.md` §2:

- input arrives at roughly **0.5 Hz**, event-driven, not as a continuous stream;
- because `Location` churns constantly, nearly every push carries a full `PlayerBaseInfo` block
  **even when nothing we display has changed**;
- state size is small and bounded: up to 25 teams × 4 players of scalar fields.

Overlay clients are broadcast browser sources: they may be opened, closed, reloaded or added
mid-match at any moment, and one may sit on a second machine's browser. Whenever one connects it
must reach a correct rendered state immediately, without waiting for the next change.

## Decision

The backend pushes the **complete, normalised match state as a snapshot** over WebSocket, and every
message carries a **monotonically increasing revision number** plus a **schema version**.

- **Full snapshots, not deltas.** The payload is a few kilobytes at most; delta protocols would buy
  nothing measurable and cost a whole class of desynchronisation bugs on a live broadcast.
- **Snapshot on connect.** A newly opened browser source immediately receives current state.
- **Server-side change detection.** The backend compares against the last broadcast snapshot and
  **only sends when something we actually render has changed**, so constant `Location` churn does
  not trigger overlay re-renders and spurious animations twice a second.
- **Coalescing.** If updates arrive faster than the broadcast interval, they collapse into the
  latest snapshot. Overlays always show the newest state; intermediate states are never queued.
- **Connection status is part of the payload**, not a side channel: overlays and admin see
  `connected` / `stale` / `disconnected` from the ingestion adapter
  ([ADR-0006](0006-pcob-ingestion-adapter-boundary.md)) and can react — the overlay by holding last
  known good state, the admin by warning the operator.
- **Clients validate with the shared Zod schema** ([ADR-0005](0005-monorepo-with-shared-contracts.md))
  and reject a message whose schema version they do not understand, with a visible error instead of
  a silently broken overlay.
- **Clients reconnect automatically** with backoff. A browser source that was open before the
  backend started must recover on its own — the operator will not be watching it.

Interpolation between the 2-second data points is a **client-side rendering concern**
([ADR-0003](0003-react-vite-tailwind-shadcn-frontend.md)), not a transport concern. The backend
sends truth; the overlay animates towards it.

## Consequences

### Positive

- A reloaded or newly added browser source is correct instantly — the single most common live
  operational action.
- No delta/patch state machine, so no drift between what the backend thinks a client shows and what
  it actually shows.
- Server-side change detection means the overlay animates only on real changes, which is both a
  performance win and a _visual quality_ win.
- Coalescing bounds client work regardless of source behaviour.

### Negative / costs accepted

- More bytes on the wire than deltas. Over loopback at 0.5 Hz this is irrelevant.
- Every client does a full diff/reconcile per message; React's reconciliation and Zustand selectors
  keep the rendering cost proportional to what actually changed.
- Change detection must compare the _rendered_ projection, not the raw model, or `Location` churn
  will defeat it. This is a real implementation trap worth a test.

### Neutral

- WebSocket over plain `ws://` on loopback — no TLS, consistent with
  [ADR-0001](0001-local-windows-bundle-over-cloud-stack.md).
- The admin uses the same channel for live preview, so previews are genuinely live.

## Alternatives considered

**Server-Sent Events.** Simpler and auto-reconnecting, but one-directional. The admin needs to send
commands (show/hide overlay, trigger animations), and we would rather not run two transports.

**HTTP polling.** Rejected: either latency or wasted requests, and no push for operator-triggered
overlay show/hide.

**Delta/patch protocol.** Rejected as premature optimisation at this payload size, at the cost of
desync bugs that would only appear on air.

**Broadcasting raw PCOB messages to clients.** Rejected — that is exactly the coupling
[ADR-0006](0006-pcob-ingestion-adapter-boundary.md) exists to prevent.

## Revisit when

- State grows large enough that full snapshots are measurably expensive.
- We need per-overlay filtered state rather than one shared snapshot.
