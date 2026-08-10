import { z } from 'zod';
import { CONFIG_SCHEMA_VERSION } from '../versions.js';

/**
 * Colours an operator can change.
 *
 * Every one of these becomes a CSS custom property on the overlay root at render time, which is why
 * they are stored as plain CSS colour strings rather than a structured colour type: the admin writes
 * a value, the browser applies it, and nothing has to re-render (ADR-0003).
 */
export const overlayColorsSchema = z.object({
  background: z.string().min(1),
  headerBackground: z.string().min(1),
  rowAltBackground: z.string().min(1),
  text: z.string().min(1),
  textMuted: z.string().min(1),
  accent: z.string().min(1),
  playerAlive: z.string().min(1),
  playerKnocked: z.string().min(1),
  playerDead: z.string().min(1),
});
export type OverlayColors = z.infer<typeof overlayColorsSchema>;

/**
 * Show/hide animation.
 *
 * Easing is a named choice rather than a raw cubic-bezier: an operator picking "smooth" or "snappy"
 * before a broadcast is making a judgement they can make, whereas four control-point numbers is a
 * question they cannot usefully answer.
 */
export const overlayAnimationSchema = z.object({
  direction: z.enum(['left', 'right', 'up', 'down', 'fade']),
  durationMs: z.number().int().min(0).max(3000),
  easing: z.enum(['smooth', 'snappy', 'linear']),
});
export type OverlayAnimation = z.infer<typeof overlayAnimationSchema>;

export const overlayAppearanceSchema = z.object({
  /** Which edge the panel is pinned to. */
  anchor: z.enum(['left', 'right']),
  /** Distance from that edge, in design-canvas pixels (ADR-0011). */
  offsetX: z.number().int().min(0).max(1800),
  /** Distance from the top, in design-canvas pixels. Null means vertically centred. */
  offsetY: z.number().int().min(0).max(1000).nullable(),
  /** Operator size multiplier, applied on top of the resolution scale. */
  scale: z.number().min(0.4).max(2.5),

  fontFamily: z.string().min(1),
  colors: overlayColorsSchema,
  animation: overlayAnimationSchema,

  showLegend: z.boolean(),
  /** Trim the table for formats with fewer than 25 teams. */
  maxTeams: z.number().int().min(1).max(25),
});
export type OverlayAppearance = z.infer<typeof overlayAppearanceSchema>;

/**
 * Instance ids appear in URLs — the browser-source address and the Companion button both use them —
 * so they are restricted to characters that survive both without escaping or ambiguity.
 */
export const overlayInstanceIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{0,31}$/,
    'Use 1–32 lowercase letters, digits or hyphens, starting with a letter or digit.',
  );

export const overlayInstanceSchema = z.object({
  id: overlayInstanceIdSchema,
  /** Operator-facing label. The id is what goes in URLs. */
  name: z.string().min(1).max(60),
  /**
   * Overlay type. A registry of one for now; deliberately not generalised until there are two to
   * generalise from.
   */
  type: z.literal('leaderboard'),
  appearance: overlayAppearanceSchema,
});
export type OverlayInstance = z.infer<typeof overlayInstanceSchema>;

export const overlayInstancesDocumentSchema = z.object({
  schemaVersion: z.number().int().min(1),
  instances: z.array(overlayInstanceSchema),
});
export type OverlayInstancesDocument = z.infer<typeof overlayInstancesDocumentSchema>;

/** Approximates `specs/example.png`, so a fresh install looks right before anything is configured. */
export const DEFAULT_OVERLAY_APPEARANCE: OverlayAppearance = {
  anchor: 'left',
  offsetX: 24,
  offsetY: null,
  scale: 1,
  fontFamily: "'Inter', system-ui, sans-serif",
  colors: {
    background: 'rgba(24, 24, 27, 0.82)',
    headerBackground: 'rgba(12, 12, 14, 0.92)',
    rowAltBackground: 'rgba(39, 39, 42, 0.55)',
    text: '#fafafa',
    textMuted: '#a1a1aa',
    accent: '#e11d48',
    playerAlive: '#ef2b2b',
    playerKnocked: '#f5a524',
    playerDead: '#52525b',
  },
  animation: {
    direction: 'left',
    durationMs: 420,
    easing: 'smooth',
  },
  showLegend: true,
  maxTeams: 16,
};

export const DEFAULT_OVERLAY_INSTANCES: OverlayInstancesDocument = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  instances: [
    {
      id: 'main',
      name: 'Main leaderboard',
      type: 'leaderboard',
      appearance: DEFAULT_OVERLAY_APPEARANCE,
    },
  ],
};
