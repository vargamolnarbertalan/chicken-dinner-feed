# ADR-0003: React + Vite + Tailwind + shadcn/ui for the frontend

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Bertalan Varga-Molnár, with analysis by Claude

## Context

`specs/APP-PLAN.md` asked for React + TypeScript + Vite, Tailwind and shadcn/ui, with smooth
animation support and state management, and invited alternatives. Nothing in the PCOB findings
argues against that stack, and it matches the required output well.

Two distinct surfaces share one codebase:

1. **Overlay** — consumed as a browser source by broadcast software. Rendered over live video at
   fixed resolution, transparent background, no user interaction, and it must animate every state
   change (health drain, knock, death, respawn, rank reordering) smoothly. See `specs/example.png`.
2. **Admin** — an ordinary interactive web app for configuring colours, fonts, sizes, placement and
   overlay in/out animations, with live previews of each overlay instance.

The overlay's real constraint is **animation quality under continuous small updates at ~0.5 Hz**
(see `specs/PCOB-FINDINGS.md` §2). Data arrives in discrete 2-second steps; the overlay must
interpolate between them so it reads as smooth motion rather than a ticking table.

## Decision

**React 19 + TypeScript + Vite 8**, styled with **Tailwind CSS v4** (via `@tailwindcss/vite`) and
**shadcn/ui** components, as proposed.

Supporting choices:

- **Motion (`motion`, formerly Framer Motion)** for animation. Layout animations and `AnimatePresence`
  handle the two hardest cases directly: teams reordering by rank, and rows entering/leaving.
- **Zustand** for client state. The live match state is a single push-driven store; Zustand's
  selector-based subscriptions let a health bar re-render without re-rendering the table.
- **TanStack Router** for routing, so the overlay routes and the protected admin routes
  ([ADR-0008](0008-admin-as-protected-frontend-route.md)) are typed.
- The overlay and the admin are **separate route trees in one Vite app**, sharing the design tokens
  and the overlay components — the admin preview renders the _real_ overlay component, not a
  lookalike.

## Consequences

### Positive

- shadcn/ui is copy-in source, not a dependency: we can restyle components freely for broadcast
  aesthetics without fighting a component library's opinions.
- Tailwind v4's CSS-variable-based theming maps cleanly onto operator-configurable colours, fonts
  and sizes — admin settings can drive CSS custom properties directly, with no re-render.
- One app means the admin preview cannot drift from the real overlay.
- Vite's build produces static assets that Fastify serves from the same origin, so no CORS and no
  second server in the bundle.

### Negative / costs accepted

- React's reconciliation is not free; with 25 teams × 4 players re-rendering twice a second we must
  be deliberate about selectors and memoisation. This is a known, measurable risk, not a guess —
  it needs a performance check once the overlay is real.
- Tailwind v4 and Vite 8 are recent majors; some ecosystem packages may lag.
- shadcn components are vendored, so we own their maintenance.

### Neutral

- Broadcast browser sources are a controlled, single-browser (Chromium) target, so we do not carry
  cross-browser compatibility burden on the overlay. The admin should still behave in normal
  browsers.

## Alternatives considered

**Svelte / SolidJS.** Genuinely better raw update performance for a high-frequency overlay. Rejected
because the input rate is ~0.5 Hz, not 60 Hz — React is comfortably fast enough — and the ecosystem
the plan asked for (shadcn/ui, Motion) is React-first.

**CSS transitions instead of Motion.** Sufficient for health bars, but not for list reordering and
enter/exit choreography, which is exactly where the overlay needs to look good.

**Separate admin application.** Rejected in [ADR-0008](0008-admin-as-protected-frontend-route.md).

## Revisit when

- A performance audit of the real overlay shows dropped frames on the broadcast machine.
- We need overlays rendered headlessly rather than in a browser source.
