import { describe, expect, it, vi } from 'vitest';
import { createOnceWarner, FieldReader } from './field-lookup.js';

const noWarn = () => {};

describe('FieldReader', () => {
  it('matches a key regardless of case', () => {
    // The vendor's own documents spell the same field isOutsideBlueCircle and isOutSideBlueCircle.
    const reader = new FieldReader({ isOutSideBlueCircle: 1 }, noWarn);

    expect(reader.number(['isOutsideBlueCircle'], 0)).toBe(1);
  });

  it('prefers the first alias that is present', () => {
    const reader = new FieldReader({ survivalTime: 10, surviceTime: 99 }, noWarn);

    expect(reader.number(['survivalTime', 'surviceTime'], 0)).toBe(10);
  });

  it('falls through to a later alias', () => {
    const reader = new FieldReader({ surviceTime: 99 }, noWarn);

    expect(reader.number(['survivalTime', 'surviceTime'], 0)).toBe(99);
  });

  it('accepts a numeric string, because PCOB sends some numbers that way', () => {
    const reader = new FieldReader({ GameTime: '161' }, noWarn);

    expect(reader.number(['GameTime'], 0)).toBe(161);
  });

  it('treats null like absent', () => {
    const reader = new FieldReader({ teamName: null }, noWarn);

    expect(reader.has(['teamName'])).toBe(false);
    expect(reader.string(['teamName'], 'fallback')).toBe('fallback');
  });

  it('warns and falls back when a field is missing', () => {
    const warn = vi.fn();
    const reader = new FieldReader({}, warn);

    expect(reader.number(['killNum'], 0)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('killNum is missing'));
  });

  it('warns when a field is present but the wrong type', () => {
    const warn = vi.fn();
    const reader = new FieldReader({ health: { value: 10 } }, warn);

    expect(reader.number(['health'], 0)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not a number'));
  });

  it('survives being handed something that is not an object', () => {
    // A truncated or unexpected payload must degrade, not throw, mid-broadcast.
    for (const value of [null, undefined, 42, 'text', []]) {
      expect(new FieldReader(value, noWarn).number(['health'], 7)).toBe(7);
    }
  });

  it('prefixes warnings with the record context', () => {
    const warn = vi.fn();
    new FieldReader({}, warn, 'player').number(['teamId'], 0);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('player: teamId'));
  });
});

describe('createOnceWarner', () => {
  it('logs a repeated message once but keeps counting it', () => {
    // At one poll per second, logging every occurrence would produce thousands of identical lines
    // an hour and bury the one that matters. The count is what shows whether a field was missing
    // once or for the whole match.
    const log = vi.fn();
    const { warn, counts } = createOnceWarner(log);

    warn('killNum is missing');
    warn('killNum is missing');
    warn('killNum is missing');

    expect(log).toHaveBeenCalledTimes(1);
    expect(counts.get('killNum is missing')).toBe(3);
  });

  it('logs distinct messages separately', () => {
    const log = vi.fn();
    const { warn } = createOnceWarner(log);

    warn('a');
    warn('b');

    expect(log).toHaveBeenCalledTimes(2);
  });
});
