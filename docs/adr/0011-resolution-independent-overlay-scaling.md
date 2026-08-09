# ADR-0011: Scale overlays from a fixed design canvas, not from viewport units

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

The client correspondence (`specs/PCOB_Tool_fejlesztes_thread.md`) commits the overlay to supporting
**FullHD, 1440p and 4K dynamically**. This requirement is not in `specs/APP-PLAN.md`; it comes from
the quote and is therefore contractual.

Broadcast browser sources are not responsive web pages. A production runs at exactly one canvas
resolution — 1920×1080, 2560×1440 or 3840×2160 — and the overlay must look **identical at all
three**, differing only in pixel density. It must not reflow, re-wrap, or change its proportions:
an overlay that looks subtly different at 4K than the director approved at 1080p is a defect.

This constrains how every overlay component is written, which is why it is decided once, up front,
rather than per component.

## Decision

Overlays are authored against a **fixed 1920×1080 design canvas** and scaled uniformly to the actual
viewport.

- All overlay dimensions — spacing, font sizes, bar widths, logo sizes — are expressed in design-canvas
  pixels via a **single root scale factor**, applied as a CSS custom property on the overlay root:

  ```
  --overlay-scale: min(100vw / 1920, 100vh / 1080)
  ```

  Sizes are then written as `calc(var(--overlay-scale) * <design px>)`, or by scaling the overlay
  root's `font-size` and expressing everything in `rem`.

- **Uniform scaling only.** The aspect ratio is preserved; the overlay never stretches. All three
  target resolutions are 16∶9, so the scale factor is exactly 1, 1.333 and 2.
- **No breakpoints and no reflow in the overlay.** A layout that rearranges itself would break the
  "identical at every resolution" requirement. Breakpoints belong to the admin, which is a normal
  responsive web app.
- The overlay reads its scale from the **viewport**, so a browser source configured at any of the
  three resolutions is correct with no configuration. Nothing needs to be set per resolution.
- The admin's live preview renders the same overlay inside a scaled container, so the preview is
  accurate at any preview size.

**Text rendering is the risk to watch.** Scaled type must stay crisp at 4K and must not shift by
sub-pixels between resolutions in a way that changes line breaks.

### Priority: 1080p is the bar, 1440p and 4K come along for free

Decided 2026-08-09. **1080p must be rock solid** — it is what productions actually run today, and it
is the resolution the client will judge the work at. 1440p and 4K are contractual and are correct
_by construction_ under this decision, but chasing pixel-perfection at those two is explicitly **not**
worth significant effort right now.

This is a statement about where verification effort goes, not a weakening of the mechanism. The
scale factor costs nothing over hardcoded pixels — it is the same amount of code — so building it in
from the start is the cheap path to all three, and skipping it would be the expensive one. Concretely:

- **Acceptance for the first overlay:** correct and polished at 1920×1080.
- **1440p and 4K:** sanity-checked (nothing clipped, nothing obviously wrong), with rounding and
  text-crispness refinements deferred until someone actually broadcasts at those resolutions.

## Consequences

### Positive

- One authored layout, three resolutions, guaranteed proportionally identical.
- Designers and the director reason in 1080p pixels — the resolution everyone already thinks in —
  while 4K output is exact.
- Adding a resolution later (for example an ultrawide canvas) is a scale-factor question, not a
  redesign.
- The admin's placement and size settings are resolution-independent by construction: a position
  expressed in design-canvas pixels means the same thing at every output resolution.

### Negative / costs accepted

- **Every overlay dimension must go through the scale factor.** A hardcoded `px` anywhere silently
  breaks at 1440p and 4K, and the bug is invisible at the resolution most development happens at.
  This needs to be a review checklist item, and is a good candidate for a lint rule later.
- Raster assets — team logos in particular — must be supplied at sufficient resolution for 4K, or
  they will scale up and blur. The PCOB convention already provides 256×256 logos
  (`specs/PCOB-FINDINGS.md` §3), which is adequate at 4K for the sizes in `specs/example.png` but
  leaves little headroom. Prefer SVG where the client can supply it.
- Sub-pixel rounding at non-integer scale factors (1.333 at 1440p) can produce off-by-one gaps
  between adjacent elements. Where this shows, borders and separators may need snapping.

### Neutral

- This is orthogonal to the operator-configurable size setting: that setting adjusts the design-canvas
  size, and the scale factor is applied on top.

## Alternatives considered

**Viewport units (`vw`/`vh`) throughout.** Superficially the same, and it is what the scale factor is
built from — but used directly it invites mixing `vw` and `vh` in one layout, which distorts at any
aspect ratio other than the one it was tuned for. Routing everything through one factor makes the
uniform-scaling guarantee structural instead of a convention people remember.

**CSS `transform: scale()` on a fixed-size root.** Genuinely simple, and it guarantees pixel-perfect
proportional output. Rejected as the primary mechanism because transformed text can render blurry in
some compositors, and because it complicates hit-testing and the admin preview. Worth reconsidering
if the scale-factor approach shows rounding artifacts in practice.

**Separate layouts per resolution.** Rejected outright: three layouts to maintain, three chances to
diverge, and it directly contradicts "identical at every resolution".

## Revisit when

- A non-16∶9 canvas is required.
- Testing at 1440p or 4K reveals text rendering or rounding artifacts that the scale factor cannot
  resolve cleanly.
