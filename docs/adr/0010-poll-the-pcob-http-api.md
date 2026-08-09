# ADR-0010: Poll the PCOB HTTP API on `127.0.0.1:10086`

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude
- **Builds on:** [ADR-0006](0006-pcob-ingestion-adapter-boundary.md) (does not supersede it)

## Context

[ADR-0006](0006-pcob-ingestion-adapter-boundary.md) was written with the transport unknown, because
the authoritative API schema document returns HTTP 401. The client correspondence
(`specs/PCOB_Tool_fejlesztes_thread.md`) answers part of that question directly. The observer is
instructed to open:

```
http://localhost:10086/gettotalplayerlist
```

after a match and refresh it repeatedly. So the API is an **HTTP server on loopback port 10086**
returning **JSON**, with no authentication mentioned. It is not a WebSocket, not a raw socket, and
not a file we tail.

Three things are still not known, and the decision has to survive all of them:

1. **Which route serves live in-match data.** `gettotalplayerlist` is described as post-match, and
   `PlayerAfterMatchAPI` fields read `0` until a match ends (`specs/PCOB-FINDINGS.md` §2.3). The
   client themselves states they do not know how the live table works.
2. **The JSON shape.** Field names and nesting are unconfirmed.
3. **Whether other routes exist.** Almost certainly, but none are named.

The upstream cadence is known: the game server collects data every **2 seconds** and pushes to the
PCOB client only on change.

## Decision

The real ingestion adapter (`PcobSource`, per ADR-0006) is an **HTTP polling client** against a
configurable base URL, defaulting to `http://127.0.0.1:10086`.

- **Poll interval defaults to 1000 ms**, configurable. Upstream refreshes every ~2 s, so polling
  faster wins nothing; polling at exactly 2 s would beat against the upstream tick and add up to a
  full interval of latency. 1 s bounds staleness at about one upstream tick without hammering a
  process that is sharing a machine with a game client.
- **Endpoints are configuration, not constants.** The route set is expressed as config with
  `gettotalplayerlist` as the only known member, so a newly discovered live route is a settings
  change rather than a code change.
- **HTTP concerns stay inside the adapter**: timeouts, retry with backoff, and treating a
  connection refusal as `disconnected` rather than as a crash. A refused connection is the normal
  state before `launch.bat` is running, not an error.
- **Responses are parsed permissively** and normalised into our own domain model, exactly as
  ADR-0006 requires. Unknown fields are ignored.
- **The adapter distinguishes "reachable but empty" from "unreachable"**, because they mean
  different things to the operator: no match running versus the API not started.

**Explicitly deferred:** which endpoint provides live state. The adapter is built and tested against
the mock source; wiring the real route is a configuration and mapping task once a single real
response has been captured.

## Consequences

### Positive

- The transport question is closed. The adapter can be written now rather than after the schema
  document arrives.
- HTTP polling is trivial to test, mock and replay: a captured response body is a complete fixture.
- Polling degrades gracefully. A missed poll is invisible; the next one recovers. With a push
  transport, a dropped connection needs explicit recovery.
- No dependency on the PCOB API implementing any push protocol correctly.

### Negative / costs accepted

- **Polling wastes requests when nothing changes.** Over loopback at 1 Hz against a local process
  this is negligible, and change detection happens at our fan-out layer anyway
  ([ADR-0007](0007-websocket-state-fanout.md)), so a redundant poll costs nothing downstream.
- **Up to ~1 s of added latency** versus a hypothetical push. Against a 2 s upstream cadence, and
  with client-side interpolation smoothing the gaps, this is not perceptible on air.
- **Port 10086 is assumed fixed.** The guideline never documents it and the client never says it is
  configurable. Making the base URL a setting is the cheap hedge, and it is in place.
- If the API turns out to offer a push channel we have not found, we will have built polling we did
  not strictly need. The adapter boundary makes that a contained rewrite.

### Neutral

- Polling makes the "stale" state trivially computable from the time since the last successful
  response, which the admin needs anyway.

## Alternatives considered

**Wait for the schema document before choosing a transport.** Rejected: we now have direct evidence
of the transport from someone who has run the tool, and access to the document has been requested
with no committed date.

**Long-polling or SSE against the same server.** Rejected: nothing suggests the server supports
either, and assuming it does would be a guess dressed as a design.

**Watch the JSON file the observer saves manually.** Rejected: that file only exists because a human
made it after the match. It is the workflow we are replacing.

## Revisit when

- **A real response is captured from a running PCOB client** — the immediate next action, and it may
  reveal a push channel or a better route.
- The schema document becomes readable.
- Profiling on a broadcast machine shows the poll interval is either too aggressive or too slow.
