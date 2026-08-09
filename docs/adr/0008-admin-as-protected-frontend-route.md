# ADR-0008: Admin is a route in the frontend app, not a separate application

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

`specs/APP-PLAN.md` proposes the admin as a protected path inside the frontend client rather than a
separate app, states that serious user management is out of scope for the POC, and asks for live
previews of each overlay.

The admin configures colours, fonts, sizes, placement and the overlay's in/out animations, and must
support **multiple overlay types and multiple instances of each type** — e.g. a light-themed and a
dark-themed leaderboard driven by the same match data.

The deployment is localhost-only ([ADR-0001](0001-local-windows-bundle-over-cloud-stack.md)): the
backend binds to the loopback interface and is not reachable from the network.

## Decision

The admin is a **route tree inside the single frontend application**, served by the same Fastify
process as the overlays.

- Overlay routes render a specific overlay instance for consumption as a browser source:
  `/overlay/:instanceId`.
- Admin routes are grouped under `/admin`.
- The admin's **live preview renders the actual overlay component**, driven by the same WebSocket
  state ([ADR-0007](0007-websocket-state-fanout.md)) and the settings currently being edited. It is
  not a mock-up — what the operator sees is what goes on air.

**Overlay instances are first-class persisted entities** ([ADR-0004](0004-json-file-persistence.md)):
each has an id, an overlay type, and its own settings document. Adding an instance produces a new
browser-source URL. Overlay _types_ are a registry in the frontend, so a new type is added without
touching the persistence model.

**Access control for the POC is deliberately minimal.** There is no login and no user management.
The protection that matters is deployment-level: the backend listens on `127.0.0.1` only, so the
admin is reachable solely from the operator's own machine. A single optional shared passphrase for
`/admin` may be added later if a setup ever exposes the port; it is explicitly **not** a security
boundary and must not be described as one.

## Consequences

### Positive

- The preview cannot drift from reality — a whole category of "it looked right in the admin" bugs
  simply cannot occur.
- One build, one dev server, one deployment; shared design tokens and components.
- Multiple instances fall out of the routing model naturally: an instance id is a URL parameter.
- Nothing to configure for auth in a POC, which is what the plan asked for.

### Negative / costs accepted

- **The overlay bundle carries admin code** unless we split it. Because overlays run as browser
  sources on the same machine over loopback, download size is not a real cost — but we should still
  lazy-load the admin route tree so an overlay page does not parse admin JavaScript. Worth doing
  once, cheaply.
- **No access control is a real limitation** the moment this runs anywhere but a trusted machine.
  This is a conscious POC trade-off and is recorded as such — it must be revisited before any
  deployment where the port is reachable by anyone else.
- Admin styling must not leak into the overlay. The overlay needs a transparent background and no
  global resets fighting it; the two route trees need clearly separated root styling.

### Neutral

- The admin is a normal responsive web app; the overlay is a fixed-resolution transparent surface.
  Different constraints, same codebase, different layout roots.

## Alternatives considered

**A separate admin application.** Rejected: it duplicates the design system and build setup, adds a
second thing to serve in the bundle, and — decisively — makes the live preview a copy of the
overlay that will inevitably drift from it.

**Desktop admin (Electron/Tauri).** Rejected: a large increase in bundle size and build complexity
for no capability we need, when a browser is already open on the machine.

**Real authentication for the POC.** Rejected as explicitly out of scope; loopback binding is the
appropriate control at this stage.

## Revisit when

- The backend ever needs to listen on a non-loopback interface — at that point authentication stops
  being optional.
- Overlay instances need to be edited by more than one person, or by someone who should not be able
  to change everything.
