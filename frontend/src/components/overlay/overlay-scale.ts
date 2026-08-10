/**
 * Resolution-independent sizing for overlay surfaces (ADR-0011).
 *
 * Every dimension in an overlay is written in **design-canvas pixels** — the 1920×1080 grid the
 * layout was authored against — and converted here. `--overlay-unit` is one design pixel expressed
 * as a real length, so the whole overlay scales uniformly to 1080p, 1440p or 4K with no breakpoints
 * and no reflow.
 *
 * A literal `px` anywhere in an overlay component is a bug: it will look right at 1080p, where
 * development happens, and wrong everywhere else.
 */
export function u(designPixels: number): string {
  return `calc(${designPixels} * var(--overlay-unit))`;
}

/** Layout constants for the leaderboard, in design-canvas pixels. Mirrors `specs/example.png`. */
export const LEADERBOARD_METRICS = {
  panelWidth: 340,
  paddingX: 10,
  headerHeight: 40,
  rowHeight: 44,
  legendHeight: 34,

  rankColumn: 26,
  logoColumn: 28,
  aliveColumn: 62,
  pointsColumn: 42,
  elimsColumn: 50,

  barWidth: 9,
  barGap: 4,
  barHeight: 27,
  /** A dead player still shows a stub, so the slot stays legible instead of vanishing. */
  deadBarHeight: 5,
} as const;
