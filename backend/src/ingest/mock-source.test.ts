import type { TeamRosterEntry } from '@cdf/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { IngestUpdate } from './source.js';
import { MockSource } from './mock-source.js';

function roster(...teamNos: number[]): TeamRosterEntry[] {
  return teamNos.map((teamNo) => ({ teamNo, name: `T${teamNo}`, logoUrl: null }));
}

describe('MockSource', () => {
  let source: MockSource | null = null;

  afterEach(async () => {
    await source?.stop();
    source = null;
  });

  it('simulates the roster it is given, not the built-in default', async () => {
    // Regression: the operator configures their real roster (imported from an ini, typically), but
    // the mock always simulated the hardcoded default regardless — editing Teams silently had no
    // effect on what a rehearsal actually showed.
    source = new MockSource({ roster: roster(101, 102), tickMs: 10_000 });

    let firstUpdate: IngestUpdate | null = null;
    source.start({
      onUpdate: (update) => {
        firstUpdate ??= update;
      },
      onStatus: () => {},
    });

    const teamNos = new Set(firstUpdate?.players.map((player) => player.teamNo));
    expect(teamNos).toEqual(new Set([101, 102]));
  });

  it('falls back to the built-in roster when none is given', async () => {
    source = new MockSource({ tickMs: 10_000 });

    let firstUpdate: IngestUpdate | null = null;
    source.start({
      onUpdate: (update) => {
        firstUpdate ??= update;
      },
      onStatus: () => {},
    });

    // The default roster is 16 teams, numbered 1-16 (shared/src/config/team-roster.ts).
    const teamNos = new Set(firstUpdate?.players.map((player) => player.teamNo));
    expect(teamNos.size).toBe(16);
  });
});
