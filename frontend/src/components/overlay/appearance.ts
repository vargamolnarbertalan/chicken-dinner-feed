import type { OverlayAnimation, OverlayAppearance } from '@cdf/shared';
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

export interface AnimationVariants {
  initial: Record<string, string | number>;
  animate: Record<string, string | number>;
  exit: Record<string, string | number>;
  transition: { duration: number; ease: [number, number, number, number] | 'linear' };
}

/**
 * Show/hide motion for the configured direction.
 *
 * Offsets are percentages of the panel's own size, so the panel always travels fully off-screen
 * regardless of resolution or the operator's scale setting.
 */
export function appearanceToAnimation(appearance: OverlayAppearance): AnimationVariants {
  const { direction, durationMs, easing } = appearance.animation;

  const hidden: Record<string, string | number> =
    direction === 'fade'
      ? { opacity: 0 }
      : direction === 'left'
        ? { x: '-115%', opacity: 0 }
        : direction === 'right'
          ? { x: '115%', opacity: 0 }
          : direction === 'up'
            ? { y: '-115%', opacity: 0 }
            : { y: '115%', opacity: 0 };

  const shown: Record<string, string | number> =
    direction === 'fade' ? { opacity: 1 } : { x: 0, y: 0, opacity: 1 };

  return {
    initial: hidden,
    animate: shown,
    exit: hidden,
    transition: { duration: durationMs / 1000, ease: EASING[easing] },
  };
}
