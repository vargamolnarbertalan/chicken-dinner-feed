import { describe, expect, it } from 'vitest';
import { formatColor, parseColor } from './color';

describe('parseColor', () => {
  it('reads a six-digit hex as fully opaque', () => {
    expect(parseColor('#EF2B2B')).toEqual({ hex: '#ef2b2b', alpha: 1 });
  });

  it('expands shorthand hex', () => {
    expect(parseColor('#f0a')).toEqual({ hex: '#ff00aa', alpha: 1 });
  });

  it('reads the alpha channel from an eight-digit hex', () => {
    const parsed = parseColor('#ff000080');

    expect(parsed?.hex).toBe('#ff0000');
    expect(parsed?.alpha).toBeCloseTo(0.5, 2);
  });

  it('reads rgba, which is how translucent panel backgrounds are stored', () => {
    expect(parseColor('rgba(24, 24, 27, 0.82)')).toEqual({ hex: '#18181b', alpha: 0.82 });
  });

  it('treats rgb without an alpha as opaque', () => {
    expect(parseColor('rgb(255, 255, 255)')).toEqual({ hex: '#ffffff', alpha: 1 });
  });

  it('accepts the space-and-slash rgb syntax', () => {
    expect(parseColor('rgb(24 24 27 / 50%)')).toEqual({ hex: '#18181b', alpha: 0.5 });
  });

  it('returns null for colours it cannot round-trip', () => {
    // Better to fall back to a text field than to silently rewrite a value we misread — the
    // defaults in globals.css are oklch, and mangling one would change what goes on air.
    expect(parseColor('oklch(0.58 0.22 27)')).toBeNull();
    expect(parseColor('rebeccapurple')).toBeNull();
    expect(parseColor('')).toBeNull();
  });

  it('clamps an out-of-range alpha instead of producing an invalid colour', () => {
    expect(parseColor('rgba(0, 0, 0, 4)')?.alpha).toBe(1);
  });
});

describe('formatColor', () => {
  it('keeps fully opaque colours as hex', () => {
    expect(formatColor('#EF2B2B', 1)).toBe('#ef2b2b');
  });

  it('writes rgba when there is transparency', () => {
    expect(formatColor('#18181b', 0.82)).toBe('rgba(24, 24, 27, 0.82)');
  });

  it('does not emit long floating point tails', () => {
    expect(formatColor('#000000', 1 / 3)).toBe('rgba(0, 0, 0, 0.33)');
  });

  it('round-trips through parseColor', () => {
    for (const value of ['#ef2b2b', 'rgba(24, 24, 27, 0.82)', 'rgba(39, 39, 42, 0.55)']) {
      const parsed = parseColor(value);
      expect(parsed).not.toBeNull();
      expect(formatColor(parsed!.hex, parsed!.alpha)).toBe(value);
    }
  });
});
