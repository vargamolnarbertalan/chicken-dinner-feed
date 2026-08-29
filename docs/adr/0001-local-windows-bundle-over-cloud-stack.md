# ADR-0001: Ship as a local Windows bundle, not a cloud Docker stack

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

`specs/APP-PLAN.md` framed this as an open choice: a Docker stack on an existing VPS (reverse
proxy and domain already available), or a self-contained Windows application started from a batch
file.

Processing the PCOB guideline settled it. The PCOB API is **not a remote service**. Section 6 of
`specs/_PCOB Guideline (Last updated 6th Jan 2026).pdf` instructs the operator to run
`WinClient_OB_live\WinClient_OB\ObToolsNew\launch.bat` on the observer PC and to keep that console
window open, or the API stops producing data. The API is a local process on a Windows machine
inside the production environment. See `specs/PCOB-FINDINGS.md` §1.

A VPS-hosted backend could therefore not reach the data source at all without introducing a
separate local collector agent that tunnels telemetry outbound to the internet — adding a second
deployable, a public ingress, credentials to manage, and internet round-trips into the live
broadcast path. Live broadcast graphics are latency-sensitive and must keep working when the venue
network does not.

Running broadcast tooling on localhost next to the production machines is also the established
convention in the field, which the plan itself noted.

## Decision

We ship **chicken-dinner-feed as an all-in-one Windows bundle** that runs entirely on the operator's
machine. The release artifact is a ZIP containing the backend, the built frontend, default
configuration and documentation. The operator runs `install-dependencies.bat` once, then
`startup.bat` before each broadcast.

No Docker, no VPS, no database server, no public network exposure. The backend binds to localhost
and serves both the admin UI and the overlay pages to the local browser and to the broadcast
software's browser source.

## Consequences

### Positive

- The app sits on the same machine as the data source — no tunnel, no ingress, no cloud dependency.
- Works fully offline during a broadcast. Internet is required only during installation.
  > **2026-08-29:** one narrow, documented exception — the built-in font choices load live from
  > Google Fonts (ADR-0016), so they need internet at page load. Everything else, including the
  > "Arial" font choice, stays fully offline as described here.
- No hosting cost, no TLS certificates, no attack surface exposed to the internet.
- The whole live data path is in-process or over loopback: latency is negligible and predictable.
- Dramatically simpler failure model to debug at a venue at 2am.

### Negative / costs accepted

- **No central management.** Multiple production machines each hold their own configuration; there
  is no shared source of truth. Accepted for the POC; the config JSON is portable and can be copied.
- **Updates are manual.** The operator downloads and unpacks a new ZIP. No auto-update in v1.
- **Node.js is a prerequisite** on the target machine. `install-dependencies.bat` must detect this
  and fail with a clear, human-readable message rather than a stack trace.
- We give up "just open a URL from anywhere" remote access to the admin.

### Neutral

- Persistence becomes a file-on-disk problem rather than a database problem — see
  [ADR-0004](0004-json-file-persistence.md).
- Release automation targets a GitHub release asset rather than a container registry — see
  [ADR-0009](0009-git-workflow-and-release-process.md).

## Alternatives considered

**Docker stack on the VPS.** Rejected: it structurally cannot reach the PCOB API without a second
local agent, and it puts the public internet in the live broadcast path.

**Local-first but cloud-ready with a storage/transport abstraction.** Rejected for now as
speculative generality. The abstraction we _are_ keeping is the one justified by a real unknown
(the ingestion adapter, [ADR-0006](0006-pcob-ingestion-adapter-boundary.md)); adding a second
abstraction for a deployment mode nobody has asked for would cost complexity in every layer for a
hypothetical. Note that ADR-0004's repository boundary already leaves a realistic migration path.

## Revisit when

- A customer needs several venues managed from one place, or overlays consumed by a remote
  broadcast operation.
- The PCOB API gains a documented remote/network-accessible mode.
