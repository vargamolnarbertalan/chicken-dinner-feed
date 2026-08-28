# ADR-0014: `/feedback` is a stable projection, not a view of the configuration

- **Status:** Accepted
- **Date:** 2026-08-14
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude
- **Refines:** [ADR-0012](0012-http-overlay-control-for-stream-decks.md)

## Context

[ADR-0012](0012-http-overlay-control-for-stream-decks.md) gave stream decks a way to _change_
overlay visibility, and had each response return the resulting state so a button could read it back.
That covers the button that pressed it. It does not cover the rest of the surface a director wants
lit: whether game data is arriving, whether anything is actually rendering an overlay, who is
leading, what an overlay is configured to do.

Companion polls an address and reads values out of the response by path. So the question was not
whether to expose this — it was what shape to expose it in, given that **the shape is the contract**.
Hyrum's Law is not a hypothetical here: the consumer is a hand-configured button that will be built
once, before a tournament, and never looked at again until it misbehaves on air.

Three decisions had to be made before writing any of it, and each was put to the operator.

## Decision

**One document at `GET /feedback`**, outside `/api`, describing overlays, data-feed health, match
progress, and every address the app answers on.

### Overlays are keyed by id, not listed

```jsonc
{ "overlays": { "main": { "isVisible": true } } } // not overlays[0].isVisible
```

An array index is positional: deleting an unrelated overlay silently repoints every button after it
at a different overlay. Nothing fails, nothing logs, and the button keeps working — wrongly. A key
is the same identifier that already appears in the browser-source address and the control URLs, so
an operator writing `overlays.main.isVisible` is writing the name they already know.

### The payload is a projection, defined separately from the persisted configuration

`feedbackDocumentSchema` in `shared/` restates the fields it publishes rather than embedding
`overlayInstanceSchema`. The two look alike today; that is a coincidence to be maintained, not a
shortcut to be taken.

Echoing the config document would have been less code and automatically complete. It would also have
made every internal rename a breaking change for someone's stream deck — and the config schema is
still moving (it has already been migrated once, for animation options). The duplication buys the
freedom to keep moving it.

Two consequences of designing for a hardware button rather than a program:

- **Every condition worth a feedback gets a boolean.** `isReceivingData`, `isStale`, `isVisible`,
  `hasConnectedSource`, `isLive`. Asking an operator to configure `data.state === "connected"` is
  asking them to get a string exactly right in a text field, from memory, under time pressure.
- **Timestamps are published twice** — an epoch stamp and a seconds-ago number — because a button
  wants to threshold "quiet for more than 10 seconds" without doing arithmetic.

`feedbackVersion` is published so a future breaking change announces itself rather than arriving as
buttons that are quietly wrong.

### The same `CONTROL_TOKEN` guards it

When a token is set, `/feedback` requires it exactly as show/hide does — one rule for the operator,
one code path (`controlTokenRejection`) that cannot drift. It is read-only, so a case could be made
for leaving it open; against that, it publishes the full configuration of every overlay, and the
only reason a token exists at all is that the app has been bound beyond loopback.

The token is **not** embedded in the URLs the document hands out. A secret should not be copied into
a response body that may be screenshotted, pasted into a support thread, or logged.

### New: browser sources are counted, and the admin preview is excluded

`connectedSources` reports how many browser sources are rendering an overlay. This is the one field
here that is not otherwise observable, and it separates two situations that look identical on air:
an overlay that is hidden, and an overlay that is showing into nothing because OBS was never pointed
at it.

For it to answer the question honestly, the admin's own preview has to be excluded — it is an iframe
of the real overlay page ([ADR-0013](0013-preview-embeds-the-real-overlay.md)) and connects over the
same channel as a browser source. The operator asking "is anything showing this?" is standing in
front of the admin, so counting their own preview would always answer yes. The preview therefore
declares itself with `?preview=1` on its WebSocket address, exactly as it already does on its page
address.

## Consequences

### Positive

- A Companion button can show state rather than only send commands.
- One request answers everything about one button, so a button never correlates two responses that
  could disagree.
- The document is self-describing: `actions` lists every address, so a lost guide is recoverable.
- The internal configuration schema stays free to change.
- `connectedSources` catches a misconfiguration that is otherwise only discovered on air.

### Negative / costs accepted

- **A second schema to maintain.** A field added to the overlay appearance does not appear at
  `/feedback` until it is added there too. This is the price of the decoupling and is deliberate —
  but it does mean the projection can silently fall behind.
- Every field published is now a commitment. The document is small on purpose for that reason.
- The preview exclusion depends on the frontend setting a query parameter. A future client that
  connects without it counts as a browser source. It is informational only, so the failure is a
  misleading number rather than a broken overlay.

### Neutral

- Served outside `/api` because its audience is a person typing an address into Companion, not a
  program. It is registered before the static plugin so its exact route beats the SPA wildcard.
- URLs are built from the request's `Host` header, so the response is correct whether it was reached
  over loopback or from another machine. The header is validated against a conservative pattern
  rather than reflected, since it ends up inside addresses handed to an operator.

## Alternatives considered

**Embedding the persisted config document verbatim.** Rejected above: less code, but it publishes
the internal schema as a contract.

**A per-overlay endpoint (`/feedback/:instanceId`).** Would give shorter paths for a single-button
poll. Rejected to keep one contract rather than two; the whole document is a few kilobytes over
loopback, and a Companion variable can hold it once for every button on the page.

**Pushing feedback over the existing WebSocket.** Companion's HTTP module polls; a socket would need
a Companion module written for it. Worth revisiting only if a custom module is ever built.

**Both a keyed object and an array.** Convenient for every consumer, but it makes two contracts out
of one and puts the same data in two places that must agree.

## Revisit when

- A second consumer appears that is not Companion — a status page or a monitoring tool might justify
  the array form after all.
- The projection has fallen behind the configuration more than once, which would argue for
  generating it from the config schema with an explicit allow-list rather than restating it.
