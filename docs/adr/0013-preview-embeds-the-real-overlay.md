# ADR-0013: The admin preview embeds the real overlay page

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude
- **Refines:** [ADR-0008](0008-admin-as-protected-frontend-route.md)

## Context

[ADR-0008](0008-admin-as-protected-frontend-route.md) put the admin in the same application as the
overlay so its preview could render the _real_ overlay component rather than a lookalike. That held,
but it only went half way: the preview rendered the leaderboard, not the overlay **page**. The
show/hide animation lives in the page's wrapper, so the preview could not show it — and an operator
choosing between animation directions and durations had no way to see any of them without pushing a
change on air and watching a browser source.

The gap would widen. Every animation option added would be an option that could only be evaluated
in production.

Two readings of "live preview" were on the table:

1. **A rehearsal stage** — local play button, animate on demand, never touching air. Safe, but the
   preview would no longer tell you what is actually on screen.
2. **The real thing** — mirror the on-air state exactly, including transitions triggered from
   anywhere.

The operator's answer was unambiguous: the real thing. Rehearsing on air is not a problem to design
around, because a broadcast has a test window before it goes live, and a director can key the layer
out while it is being worked on. That is their call to make, not the tool's.

## Decision

The preview is an **`<iframe>` of `/overlay/<id>`** — the same address a broadcast browser source
uses — rendered at 1920×1080 and scaled optically to fit.

Identity therefore comes from construction rather than maintenance. The frame holds its own
WebSocket connection, its own visibility state, its own fonts and its own animations, so a show or
hide triggered from the admin, a Stream Deck or a `curl` plays in the preview exactly as it plays on
air. Anything added to the overlay later appears in the preview with no work.

Rendering at full canvas size and scaling the result means layout rounding happens at broadcast
resolution, so what is judged in the preview is what the canvas produces.

**One concession is made to embedding.** An iframe cannot show the page behind it here: a document
with no background of its own still paints a canvas, and that colour comes from `color-scheme`,
which has no value meaning "transparent". So the overlay page draws its own chequerboard backdrop
when its address carries `?preview=1`. A real browser source is composited transparently by the
broadcast software and never receives that marker; only the admin appends it.

## Consequences

### Positive

- The preview cannot drift from what goes on air, because it _is_ what goes on air.
- Animations are previewable at all — including direction, duration and easing — which is what makes
  expanding the animation settings worth doing.
- Future overlay types and features need no preview work.
- A change made from a stream deck is visible in the admin, which makes the on-air badge and the
  preview agree.

### Negative / costs accepted

- **The preview no longer updates as you type.** It shows _saved_ settings, because those are what
  is on air. Adjusting a colour now means save, then look. This is a real loss of immediacy, and it
  is the direct consequence of choosing fidelity over convenience.
- **Rehearsal happens on air.** Trying an animation puts it on the live output. Accepted explicitly:
  productions have a test window, and the director can key the layer out meanwhile.
- An extra WebSocket client per open admin. Negligible over loopback.
- The overlay page gains one branch it would not otherwise have — the preview backdrop. It is
  scoped to a query parameter that only the admin sets, and it changes nothing about the panel.

### Neutral

- Scaling is computed in JavaScript from the container width, because `transform: scale()` takes a
  number and CSS cannot portably divide one length by another.

## Alternatives considered

**A shared animated component used by both the page and the preview.** Would have kept the
as-you-type preview and avoided the iframe. Rejected because it is still a second rendering path
that has to be kept in step by hand, and the operator asked for exact equivalence rather than a
close copy.

**A local rehearsal mode with its own play button, alongside the real state.** Rejected as the
primary answer for the same reason: it makes the preview show something that is not on air. Worth
revisiting only if rehearsing without touching the output ever becomes a requirement.

**Pushing draft settings into the frame over `postMessage`** to restore as-you-type editing.
Rejected for now: it reintroduces a state the preview shows and the broadcast does not, which is the
ambiguity this decision removes. It remains the obvious escape hatch if losing immediacy proves too
costly in practice.

## Revisit when

- Editing appearance without saving becomes painful enough that the immediacy is worth the
  ambiguity — at which point `postMessage` is the route.
- Rehearsing an animation without putting it on air becomes a real requirement.
