import type { OverlayAnimation, OverlayAppearance } from '@cdf/shared';
import type { Variants } from 'motion/react';
import type { CSSProperties } from 'react';

/**
 * Turn an instance's appearance into CSS custom properties.
 *
 * This is why the design tokens were custom properties from the start (ADR-0003): applying an
 * operator's colour change is a style write on one element, not a re-render of a table that is
 * already updating twice a second.
 *
 * The `scale` multiplier folds into `--overlay-unit`, so an operator resizing the panel and the
 * browser source running at 4K compose correctly instead of fighting each other (ADR-0011).
 */
export function appearanceToCssVariables(appearance: OverlayAppearance): CSSProperties {
  const { colors } = appearance;

  return {
    // Derived from the base rather than recomputed, so the admin preview can pin the base to its
    // own box and still have the operator's size setting apply.
    '--overlay-unit': `calc(var(--overlay-base-unit) * ${appearance.scale})`,
    '--overlay-font-family': appearance.fontFamily,
    '--overlay-bg': colors.background,
    '--overlay-header-bg': colors.headerBackground,
    '--overlay-row-alt-bg': colors.rowAltBackground,
    '--overlay-text': colors.text,
    '--overlay-text-muted': colors.textMuted,
    '--overlay-accent': colors.accent,
    '--player-alive': colors.playerAlive,
    '--player-knocked': colors.playerKnocked,
    '--player-dead': colors.playerDead,
  } as CSSProperties;
}

/**
 * Where the panel sits on the design canvas.
 *
 * Offsets use the **base** unit, not the scaled one: "24 pixels from the left edge" should mean the
 * same distance whether the operator has the panel at 80% or 150%. Tying the margin to the panel's
 * size would move it every time they touched the size slider.
 */
export function appearanceToPosition(appearance: OverlayAppearance): CSSProperties {
  const offsetX = `calc(${appearance.offsetX} * var(--overlay-base-unit))`;

  const vertical: CSSProperties =
    appearance.offsetY === null
      ? { top: '50%', transform: 'translateY(-50%)' }
      : { top: `calc(${appearance.offsetY} * var(--overlay-base-unit))` };

  return {
    position: 'fixed',
    ...(appearance.anchor === 'left' ? { left: offsetX } : { right: offsetX }),
    ...vertical,
  };
}

const EASING: Record<OverlayAnimation['easing'], [number, number, number, number] | 'linear'> = {
  // A decelerating curve — the panel arrives rather than stops dead.
  smooth: [0.22, 1, 0.36, 1],
  snappy: [0.16, 1, 0.3, 1],
  linear: 'linear',
};

type Target = Record<string, string | number>;

/**
 * The hidden end of each motion.
 *
 * Slide offsets are percentages of the panel's own size, so it always travels fully off screen
 * whatever the resolution or the operator's scale setting.
 *
 * Wipe is a mask rather than movement: `inset()` clips from one edge, so the panel stays exactly
 * where it is and its text does not shift while it is revealed. That is what distinguishes it from
 * slide, and it is the reading broadcast people expect.
 */
function hiddenTarget(animation: OverlayAnimation): Target {
  switch (animation.type) {
    case 'fade':
      return {};

    case 'zoom-fade':
      return { scale: 0.92 };

    case 'slide':
      switch (animation.direction) {
        case 'left':
          return { x: '-115%' };
        case 'right':
          return { x: '115%' };
        case 'top':
          return { y: '-115%' };
        case 'bottom':
          return { y: '115%' };
      }
      break;

    case 'wipe':
      // inset(top right bottom left) — each case clips everything away from the opposite side, so
      // the reveal grows out of the named edge.
      switch (animation.direction) {
        case 'left':
          return { clipPath: 'inset(0% 100% 0% 0%)' };
        case 'right':
          return { clipPath: 'inset(0% 0% 0% 100%)' };
        case 'top':
          return { clipPath: 'inset(0% 0% 100% 0%)' };
        case 'bottom':
          return { clipPath: 'inset(100% 0% 0% 0%)' };
      }
  }

  return {};
}

function shownTarget(animation: OverlayAnimation): Target {
  switch (animation.type) {
    case 'fade':
      return {};
    case 'zoom-fade':
      return { scale: 1 };
    case 'slide':
      return { x: 0, y: 0 };
    case 'wipe':
      return { clipPath: 'inset(0% 0% 0% 0%)' };
  }
}

export interface AnimationVariants {
  /** Passed straight to the panel's `motion.div`; the row variants live beside them. */
  variants: Variants;
  rowsEnabled: boolean;
}

/**
 * Turn an instance's animation settings into the two ends of the transition.
 *
 * The fade is added on top of whatever the type does, uniformly — including `zoom-fade`, where
 * switching it off leaves a pure zoom. One rule for every type is easier to predict than a per-type
 * exception, even if the name then over-promises slightly.
 *
 * Each variant carries its own transition, because entering and leaving are not mirror images. On
 * the way in the panel arrives first and the rows follow (`beforeChildren`); on the way out — when
 * the reverse is switched on — the rows leave first and the panel follows them (`afterChildren`),
 * bottom-up, so the list empties the way it filled. A single shared transition would apply the exit
 * ordering to the entrance as well.
 */
export function appearanceToAnimation(appearance: OverlayAppearance): AnimationVariants {
  const { animation } = appearance;
  const fade = animation.withFade || animation.type === 'fade';
  const base = { duration: animation.durationMs / 1000, ease: EASING[animation.easing] };
  const stagger = animation.rows.staggerMs / 1000;
  const rowsEnabled = animation.rows.enabled;

  return {
    rowsEnabled,
    variants: {
      visible: {
        ...shownTarget(animation),
        ...(fade ? { opacity: 1 } : {}),
        transition: rowsEnabled
          ? { ...base, when: 'beforeChildren', staggerChildren: stagger }
          : base,
      },
      hidden: {
        ...hiddenTarget(animation),
        ...(fade ? { opacity: 0 } : {}),
        transition:
          rowsEnabled && animation.rows.reverseOnHide
            ? { ...base, when: 'afterChildren', staggerChildren: stagger, staggerDirection: -1 }
            : base,
      },
    },
  };
}

/** Rows only ever change opacity, so they keep their space and the panel never resizes. */
export const ROW_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
} as const;
