import { describe, expect, it } from 'vitest';
import { isDeepEqual } from './deep-equal';

describe('isDeepEqual', () => {
  it('ignores key order', () => {
    // The reason this exists rather than a JSON.stringify comparison: an edit that rebuilds an
    // object with the same values in a different order must not read as a change.
    expect(isDeepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('sees a changed value', () => {
    expect(isDeepEqual({ durationMs: 420 }, { durationMs: 900 })).toBe(false);
  });

  it('compares nested structures, which is where the animation settings live', () => {
    const left = { animation: { type: 'slide', rows: { enabled: false, staggerMs: 60 } } };
    const right = { animation: { type: 'slide', rows: { enabled: false, staggerMs: 60 } } };

    expect(isDeepEqual(left, right)).toBe(true);
    expect(
      isDeepEqual(left, { animation: { type: 'slide', rows: { enabled: true, staggerMs: 60 } } }),
    ).toBe(false);
  });

  it('reports equal again once a change is undone', () => {
    // The behaviour that matters for the Save button: edit, revert, and it must go quiet again.
    const saved = { colors: { accent: '#e11d48' }, maxTeams: 16 };
    const edited = { ...saved, colors: { accent: '#00ff00' } };
    const reverted = { ...edited, colors: { accent: '#e11d48' } };

    expect(isDeepEqual(saved, edited)).toBe(false);
    expect(isDeepEqual(saved, reverted)).toBe(true);
  });

  it('handles arrays by position', () => {
    expect(isDeepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(isDeepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(isDeepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('does not confuse an array with an object', () => {
    expect(isDeepEqual([], {})).toBe(false);
  });

  it('distinguishes null from an object and from undefined', () => {
    expect(isDeepEqual(null, {})).toBe(false);
    expect(isDeepEqual(null, undefined)).toBe(false);
    expect(isDeepEqual(null, null)).toBe(true);
  });

  it('treats a missing key as different from an undefined value', () => {
    // Otherwise removing a field would silently look unchanged.
    expect(isDeepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });

  it('compares primitives', () => {
    expect(isDeepEqual('slide', 'slide')).toBe(true);
    expect(isDeepEqual(1, '1')).toBe(false);
    expect(isDeepEqual(true, false)).toBe(false);
  });
});
