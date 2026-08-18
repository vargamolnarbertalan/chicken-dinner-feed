import type { IngestConnectionState } from '@cdf/shared';
import { describe, expect, it, vi } from 'vitest';
import type { IngestUpdate } from '../source.js';
import { PcobSource } from './pcob-source.js';

interface Recorded {
  updates: IngestUpdate[];
  statuses: { state: IngestConnectionState; message?: string | null }[];
}

/**
 * A stand-in for ob.js.
 *
 * Deliberately answers **without a Content-Type header**, exactly as the real server does — it only
 * ever calls `response.write(str)`. Anything that dispatches on that header behaves differently
 * against the real thing, which is a fault we have already been bitten by once in the capture
 * tooling.
 */
function fakeApi(routes: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL) => {
    const route = String(input).split('/').pop() ?? '';
    if (!(route in routes)) throw new Error(`unexpected route ${route}`);
    return new Response(JSON.stringify(routes[route]), { status: 200 });
  }) as unknown as typeof fetch;
}

/**
 * Starts the source and returns what it reported.
 *
 * `start()` fires an eager poll so an operator sees data immediately rather than after a full
 * interval. Tests therefore await `poll()`, which coalesces onto that in-flight poll instead of
 * starting a competing one.
 */
function record(source: PcobSource): Recorded {
  const recorded: Recorded = { updates: [], statuses: [] };
  source.start({
    onUpdate: (update) => recorded.updates.push(update),
    onStatus: (state, message) => recorded.statuses.push({ state, message }),
  });
  return recorded;
}

const PLAYER = {
  playerKey: 1,
  playerName: 'One',
  teamId: 1,
  health: 90,
  healthMax: 100,
  liveState: 0,
  killNum: 2,
};

describe('PcobSource', () => {
  it('maps a poll into an update', async () => {
    const source = new PcobSource({
      baseUrl: 'http://127.0.0.1:10086',
      fetchImpl: fakeApi({
        getallinfo: { allinfo: { TotalPlayerList: [PLAYER], GameID: 'room-9' } },
        isingame: { isInGame: true },
      }),
    });
    const recorded = record(source);

    await source.poll();
    await source.stop();

    expect(recorded.updates.at(-1)).toMatchObject({
      matchId: 'room-9',
      phase: 'live',
      players: [{ name: 'One', teamNo: 1, slot: 1, kills: 2, liveState: 'alive' }],
    });
  });

  it('handles the idle server, which is the normal state before a match', async () => {
    // Verified against the real ob.js: with nothing posted it answers {"allinfo":{}}.
    const source = new PcobSource({
      baseUrl: 'http://127.0.0.1:10086',
      fetchImpl: fakeApi({ getallinfo: { allinfo: {} }, isingame: { isInGame: false } }),
    });
    const recorded = record(source);

    await source.poll();
    await source.stop();

    expect(recorded.updates.at(-1)).toMatchObject({ phase: 'idle', players: [] });
    expect(recorded.statuses.map((s) => s.state)).toContain('connected');
  });

  it('reports an unreachable API as disconnected rather than throwing', async () => {
    // This is the expected state before launch.bat is running, and what a mid-match PCOB crash
    // looks like. It must never propagate out of the poll loop.
    const source = new PcobSource({
      baseUrl: 'http://127.0.0.1:10086',
      fetchImpl: (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch,
    });
    const recorded = record(source);

    await expect(source.poll()).resolves.toBeUndefined();
    await source.stop();

    expect(recorded.statuses.some((s) => s.state === 'disconnected')).toBe(true);
    expect(recorded.updates).toHaveLength(0);
  });

  it('survives a response that is not JSON at all', async () => {
    const source = new PcobSource({
      baseUrl: 'http://127.0.0.1:10086',
      fetchImpl: (async () => new Response('<html>proxy error</html>')) as unknown as typeof fetch,
    });
    const recorded = record(source);

    await expect(source.poll()).resolves.toBeUndefined();
    await source.stop();

    expect(recorded.statuses.some((s) => s.state === 'disconnected')).toBe(true);
  });

  it('does not start a second poll while one is still running', async () => {
    // ob.js leaves the socket open for a route it does not handle, so a poll can outlive its tick.
    // Overlapping polls would race on the mapper's slot assignments.
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = vi.fn();

    const source = new PcobSource({
      baseUrl: 'http://127.0.0.1:10086',
      fetchImpl: (async (input: string | URL) => {
        calls();
        await gate;
        const route = String(input).split('/').pop() ?? '';
        const body = route === 'isingame' ? { isInGame: false } : { allinfo: {} };
        return new Response(JSON.stringify(body));
      }) as unknown as typeof fetch,
    });
    record(source);

    const first = source.poll();
    const second = source.poll();
    const callsDuringOverlap = calls.mock.calls.length;

    // Coalesced onto the in-flight poll rather than starting a second one.
    expect(second).toBe(first);
    expect(callsDuringOverlap).toBe(2); // getallinfo + isingame, from the first poll only

    release?.();
    await first;
    await source.stop();
  });

  it('aborts a request that never gets a response', async () => {
    // The failure mode this guards: ob.js logs "handle not found" and returns without ending the
    // response, so a wrong route hangs instead of erroring.
    const source = new PcobSource({
      baseUrl: 'http://127.0.0.1:10086',
      timeoutMs: 20,
      fetchImpl: ((_input: string | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })) as unknown as typeof fetch,
    });
    const recorded = record(source);

    await source.poll();
    await source.stop();

    expect(recorded.statuses.some((s) => s.state === 'disconnected')).toBe(true);
  });

  it('trims a trailing slash so the base URL is forgiving', async () => {
    const seen: string[] = [];
    const source = new PcobSource({
      baseUrl: 'http://127.0.0.1:10086/',
      fetchImpl: (async (input: string | URL) => {
        seen.push(String(input));
        const route = String(input).split('/').pop() ?? '';
        const body = route === 'isingame' ? { isInGame: false } : { allinfo: {} };
        return new Response(JSON.stringify(body));
      }) as unknown as typeof fetch,
    });
    record(source);

    await source.poll();
    await source.stop();

    expect(seen).toContain('http://127.0.0.1:10086/getallinfo');
  });
});
