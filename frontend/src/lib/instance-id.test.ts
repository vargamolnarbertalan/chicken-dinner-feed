import { describe, expect, it } from 'vitest';
import { toInstanceId } from './instance-id';

describe('toInstanceId', () => {
  it('strips Hungarian accents rather than dropping the letters', () => {
    // The bug this function exists to fix: an operator types a natural name and the server rejects
    // the id. Dropping accented characters instead of transliterating would give "sz-p-tabella".
    expect(toInstanceId('Szép tabella')).toBe('szep-tabella');
    expect(toInstanceId('Első átfogó nézet')).toBe('elso-atfogo-nezet');
    expect(toInstanceId('Győztes')).toBe('gyoztes');
  });

  it('lowercases and joins words with hyphens', () => {
    expect(toInstanceId('Second Leaderboard')).toBe('second-leaderboard');
  });

  it('collapses runs of punctuation and whitespace into one hyphen', () => {
    expect(toInstanceId('Main  ---  overlay!!')).toBe('main-overlay');
  });

  it('does not start or end with a hyphen', () => {
    expect(toInstanceId('  --Main--  ')).toBe('main');
    expect(toInstanceId('!leading')).toBe('leading');
  });

  it('keeps digits, and allows an id that starts with one', () => {
    expect(toInstanceId('4K feed')).toBe('4k-feed');
  });

  it('truncates to the 32 characters the id schema allows, without a trailing hyphen', () => {
    const result = toInstanceId('a very long overlay name that goes on and on forever');

    expect(result.length).toBeLessThanOrEqual(32);
    expect(result.endsWith('-')).toBe(false);
    expect(result.startsWith('a-very-long-overlay-name')).toBe(true);
  });

  it('returns an empty string when there is nothing to build an id from', () => {
    // The caller uses this to disable the buttons and explain why, rather than letting the server
    // reject it.
    expect(toInstanceId('')).toBe('');
    expect(toInstanceId('!!! ???')).toBe('');
  });

  it('produces ids the server will accept', () => {
    const serverRule = /^[a-z0-9][a-z0-9-]{0,31}$/;

    for (const input of ['Szép tabella', 'Dark theme', '4K feed', 'Main  ---  overlay!!']) {
      expect(toInstanceId(input)).toMatch(serverRule);
    }
  });
});
