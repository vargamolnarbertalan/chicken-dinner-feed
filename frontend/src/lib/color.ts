export interface ParsedColor {
  /** `#rrggbb`, which is what `<input type="color">` requires. */
  hex: string;
  /** 0–1. */
  alpha: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = /^rgba?\(\s*([0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)(?:[\s,/]+([0-9.%]+))?\s*\)$/i;

function toHexPair(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * Split a CSS colour into a hex value and an alpha.
 *
 * Overlay panels sit over live video, so their backgrounds are translucent — and
 * `<input type="color">` has no concept of alpha. Rather than drop the transparency an operator
 * needs, or make them hand-write `rgba(...)`, we split the value in two and offer a swatch plus an
 * opacity slider.
 *
 * Returns null for anything we cannot round-trip safely (`oklch()`, named colours, gradients). The
 * caller falls back to a plain text field rather than silently rewriting a value it misread.
 */
export function parseColor(value: string): ParsedColor | null {
  const input = value.trim();

  const hexMatch = HEX.exec(input);
  if (hexMatch?.[1]) {
    const digits = hexMatch[1];

    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b, a] = digits.split('');
      return {
        hex: `#${r}${r}${g}${g}${b}${b}`.toLowerCase(),
        alpha: a === undefined ? 1 : parseInt(`${a}${a}`, 16) / 255,
      };
    }

    return {
      hex: `#${digits.slice(0, 6)}`.toLowerCase(),
      alpha: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgbMatch = RGB.exec(input);
  if (rgbMatch) {
    const [, r, g, b, a] = rgbMatch;
    const alphaText = a ?? '1';
    const alpha = alphaText.endsWith('%')
      ? Number(alphaText.slice(0, -1)) / 100
      : Number(alphaText);

    return {
      hex: `#${toHexPair(Number(r))}${toHexPair(Number(g))}${toHexPair(Number(b))}`,
      alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1,
    };
  }

  return null;
}

/** Fully opaque colours stay as hex — shorter, and what an operator recognises. */
export function formatColor(hex: string, alpha: number): string {
  if (alpha >= 1) return hex.toLowerCase();

  const digits = hex.replace('#', '');
  const r = parseInt(digits.slice(0, 2), 16);
  const g = parseInt(digits.slice(2, 4), 16);
  const b = parseInt(digits.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(2))})`;
}
