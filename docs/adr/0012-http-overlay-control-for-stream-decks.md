# ADR-0012: Overlay visibility is server-owned state, driven by plain HTTP

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

Directors do not operate a broadcast from a web page. They press physical buttons, almost always on
a Stream Deck driven by **Bitfocus Companion**, which triggers actions by sending HTTP requests.
Showing and hiding an overlay has to work from there.

Two things follow that are not obvious:

1. **Visibility cannot be a client-side concern.** If the overlay page decided its own visibility,
   a browser source reloaded mid-show would come back in the wrong state, and two browser sources
   rendering the same instance could disagree. The state has to live where the trigger arrives.
2. **The trigger and the render are different processes.** Companion talks HTTP; the overlay is a
   WebSocket client. Something has to bridge them.

`specs/APP-PLAN.md` already called for show/hide animation control; this decides its mechanism.

## Decision

**Overlay visibility is state owned by the backend**, changed over HTTP and pushed to overlays over
WebSocket.

### The HTTP surface

```
GET|POST /api/overlays/:instanceId/show
GET|POST /api/overlays/:instanceId/hide
GET|POST /api/overlays/:instanceId/toggle
GET      /api/overlays/:instanceId/state
```

Three deliberate concessions to how these are actually used:

- **`GET` is accepted as well as `POST`.** Strictly, a state change should not be a `GET`. None of
  the reasons that rule exists apply here — no browser prefetch, no crawler, no caching proxy, a
  loopback address, and a hardware button as the client. Requiring `POST` would add a configuration
  step that operators get wrong under time pressure, and the failure mode is a dead button during a
  live show.
- **Separate `show` / `hide` / `toggle` verbs** rather than one endpoint taking a boolean, because a
  Companion button _is_ a URL. The action has to be expressible in the path.
- **Every response returns the resulting state**, so Companion can read it back for button feedback
  instead of tracking state it cannot see.

### Behaviour that matters on air

- **Re-triggering the current state is a no-op.** Pressing "show" on an already-visible overlay
  returns the existing state unchanged and sends no message. Without this, a director tapping a key
  twice would restart the animation and make the overlay flicker on air.
- **`changedAt` distinguishes a transition from a starting state.** An overlay page opened while the
  instance is already visible appears instantly; it does not slide in as though it had just been
  triggered.
- **An overlay renders nothing until it knows its visibility.** Assuming "visible" while waiting for
  the first message would flash the overlay on screen every time a hidden one is reloaded.
- **Visibility is its own WebSocket message, not part of the match snapshot.** Match data is shared
  by every overlay and changes constantly; visibility is per-instance and changes only when a
  director presses a button. Merging them would make one key press rebroadcast the entire match
  state to every overlay in the production.

### Network exposure and the optional token

Companion frequently runs on a **different machine** from the one rendering overlays. That collides
directly with [ADR-0008](0008-admin-as-protected-frontend-route.md), where loopback binding _is_ the
access control, because the admin has no authentication.

We resolve it without adding an auth system:

- ~~The default stays `127.0.0.1`.~~ **Revised 2026-08-29:** the default is now `0.0.0.0` — see the
  note below.
- **`HOST` can be opened up** for a remote Companion. Doing so logs a warning at startup naming
  exactly what is now reachable, rather than changing the security posture silently.
- **`CONTROL_TOKEN` is optional and off by default.** When set, the control endpoints require it as
  `?token=` or an `X-Control-Token` header — both trivial in Companion. It is a speed bump against
  accidents and curious people on a venue LAN, **not authentication**, and it does not protect the
  admin UI.

> **2026-08-29:** flipped the default from `127.0.0.1` to `0.0.0.0`, on the operator's decision,
> made with the trade-off below understood: a remote Companion needing no `.env` change at all was
> judged worth more than an unauthenticated admin UI staying off the network by default. The
> startup warning (unchanged) is what now fires on every default install rather than only on an
> explicit opt-in — this is the exact trigger ADR-0008's "Revisit when" names for adding real
> authentication, still not done. Set `HOST=127.0.0.1` in `.env` to restore the old behavior.

## Consequences

### Positive

- Works with Companion's generic HTTP module out of the box: paste a URL onto a button, done.
- Not Companion-specific — anything that can make an HTTP request works, including `curl` in a
  batch file, vMix scripting, or a browser bookmark.
- State survives browser-source reloads, which is the failure directors actually hit.
- Instance-scoped from the start, so multiple overlays are independently controllable without
  redesign.

### Negative / costs accepted

- **`GET` mutates state.** Defensible here, and it would not be in a public API. Recorded so nobody
  later "fixes" it and silently breaks every configured button.
- **Anyone who can reach the port can control the overlays.** Since 2026-08-29 the default
  (`HOST=0.0.0.0`) already puts everyone on the LAN in that position; the warning and optional
  token are the only mitigation. Restrict `HOST` to `127.0.0.1` for a closed, single-machine setup.
- Visibility is not persisted. An app restart mid-show returns overlays to their default. This is
  deliberate — a restart should give a known state, not resurrect whatever was on screen when it
  crashed — but it does mean a restart is visible on air.
- Instances are created implicitly on first reference, so a typo in a Companion URL silently
  controls a new instance nobody is watching rather than erroring. Acceptable while overlay
  instances are not yet persisted entities; worth revisiting when they are.

### Neutral

- The same endpoints are what the admin will call, so the admin gets no privileged path.

## Alternatives considered

**WebSocket commands from the admin only.** Rejected: it makes a browser the required controller,
which is exactly what a director does not want mid-show.

**A dedicated Companion module.** Nicer buttons and built-in feedback, but it is a separate
published artifact with its own release cycle, and the generic HTTP module already covers the need.
Worth revisiting if this ships to more productions.

**Per-instance secrets or real authentication.** Disproportionate for a POC on loopback, and it adds
a credential for an operator to lose. The optional shared token is the proportionate middle.

## Revisit when

- Overlay instances become persisted entities — implicit creation should probably become an error.
- The app is deployed anywhere the port is routinely reachable by people who should not control it.
- Directors need richer control than show/hide (per-overlay animation choice, transitions between
  overlay types).
