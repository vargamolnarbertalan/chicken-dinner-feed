# ADR-0016: Built-in fonts are loaded live from Google Fonts, not the local machine

- **Status:** Accepted
- **Date:** 2026-08-29
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude
- **Supersedes / Superseded by:** —

## Context

The built-in font choices in `AppearanceEditor`'s `FONT_OPTIONS` (Inter, Rajdhani, Barlow Condensed)
were never anything more than CSS `font-family` name strings. Nothing in the app ever declared a
matching `@font-face`, bundled a font file, or linked a stylesheet for them — whether any of the
three actually rendered depended entirely on whether that exact font happened to already be
installed, system-wide, on whichever machine was running the browser source. On a fresh Windows
install none of the three are present, so selecting them silently fell back to `system-ui`
(Segoe UI) — the operator's overlay looked different from one PC to the next depending on what else
was installed there, which is exactly the "same setting, different result" defect this decision
fixes.

## Decision

**Built-in fonts are loaded live over HTTP from Google Fonts** (`fonts.googleapis.com` /
`fonts.gstatic.com`), via a `<link rel="stylesheet">` in `frontend/index.html`, rather than bundled
with the app or left dependent on the local machine.

- **One weight per family, not a range.** The stylesheet requests exactly `Inter:wght@700`,
  `Rajdhani:wght@600`, `Barlow+Condensed:wght@600` — nothing else. `AppearanceEditor`'s picker labels
  them accordingly ("Inter Bold", "Rajdhani SemiBold", "Barlow Condensed SemiBold"), matching how an
  uploaded custom font is also always one concrete file, not a family with choices still open.
  `font-display: block` matches the reasoning already established for uploaded fonts
  (`frontend/src/lib/font-faces.ts`): a broadcast should hold briefly and appear correct rather than
  flash the wrong typeface while the real one loads.
- **"Arial" is offered alongside them, needing no network at all.** A plain, universally-installed
  Windows font — the safe choice for a venue with no internet on site, or for anyone who would
  rather not depend on it.
- **Every built-in choice's CSS value keeps its existing fallback stack**
  (e.g. `"'Inter', system-ui, sans-serif"`). If Google Fonts cannot be reached — no internet, a
  captive portal, a firewalled venue network — the browser falls back to the next entry in the stack
  automatically. This degrades to "looks like the old default" rather than failing to render at all.

**This is a deliberate, documented exception to ADR-0001** ("works fully offline during a
broadcast"). The venue-network dependency was weighed against the alternative — the exact
per-machine inconsistency this decision exists to fix — and accepted for the built-in choices
specifically. Self-hosting the same three font files inside the app bundle (no runtime network
dependency at all) was the first design explored and works technically, but the operator's own
explicit instruction was to reference Google Fonts live rather than fetch-and-ship them, so that is
what shipped; an operator who needs guaranteed offline behavior should pick "Arial" or upload a
custom font file — either path has zero network dependency, before or during a broadcast.

## Consequences

### Positive

- The three built-in choices now render identically on every machine that has internet at load time,
  regardless of what else is installed there — the actual goal.
- No app bundle size increase, no font files to keep in sync with Google's own updates.
- Graceful, silent degradation (the existing fallback stack) rather than a hard failure when
  offline — the previous "might silently be the wrong font" state, not a new failure mode.

### Negative / costs accepted

- **A genuine, documented exception to "works fully offline during a broadcast".** A venue with no
  internet, or a browser source that reloads mid-show while the network happens to be down, renders
  the built-in choices as their fallback font instead — cosmetically different from what was
  configured, though never a crash or a blank overlay.
- Depends on Google's own CDN being reachable and unchanged; if a font's URL or availability changes
  upstream, the built-in choice degrades to its fallback until `index.html` is updated.

### Neutral

- `frontend/public/fonts/` (previously an empty placeholder) stays unused for now — it would be
  where self-hosted files go if this decision is ever revisited.

## Alternatives considered

**Self-host the same three Google Fonts files in the app bundle**, downloaded once at development
time into `frontend/public/fonts/` and served as a build asset — zero runtime network dependency,
otherwise identical result. Technically the more robust option and fully explored (files downloaded
and verified as valid `.woff2` before this ADR was written), but rejected in favor of the operator's
explicit instruction to reference Google Fonts live instead of fetching and shipping the files.

**Leave the built-in choices as local-machine-dependent, document the limitation.** Rejected: it does
not fix the actual defect, only explains it.

**Drop the three named fonts entirely, ship "Arial" as the only built-in.** The explicitly-named
fallback plan if a stable solution could not be found. Not needed — the live Google Fonts approach
works and was the operator's preferred mechanism — but "Arial" is kept in the list as the
zero-dependency option this alternative would have made the only one.

## Revisit when

- The venue network cannot be trusted to have internet access during setup, and the per-machine
  inconsistency this decision fixes needs to be solved without any runtime dependency — self-host the
  same files into `frontend/public/fonts/` instead (already proven to work).
- Google Fonts changes a URL, a weight, or retires a family used here.
