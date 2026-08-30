import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IngestPlayer, IngestUpdate } from '../ingest/source.js';
import { ConfigStore } from '../persistence/config-store.js';
import { MatchStore } from '../state/match-store.js';
import { SeriesStore } from '../state/series-store.js';
import { seriesRoutes } from './series.js';

function player(
  overrides: Partial<IngestPlayer> & Pick<IngestPlayer, 'teamNo' | 'slot'>,
): IngestPlayer {
  return {
    id: `p${overrides.teamNo}-${overrides.slot}`,
    name: `Player ${overrides.teamNo}-${overrides.slot}`,
    liveState: 'alive',
    health: 100,
    healthMax: 100,
    kills: 0,
    rank: 0,
    ...overrides,
  };
}

function update(overrides: Partial<IngestUpdate> = {}): IngestUpdate {
  return { matchId: 'match-1', phase: 'live', players: [], ...overrides };
}

describe('series routes', () => {
  let dir: string;
  let app: FastifyInstance;
  let match: MatchStore;
  let series: SeriesStore;
  let seriesChanged: number;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cdf-series-routes-'));

    const config = new ConfigStore({ dataDir: dir });
    await config.load();

    match = new MatchStore({
      source: 'pcob',
      roster: [
        { teamNo: 1, name: 'Alpha', logoUrl: null },
        { teamNo: 2, name: 'Bravo', logoUrl: null },
      ],
    });
    series = new SeriesStore({ dataDir: dir });
    await series.load();
    seriesChanged = 0;

    app = Fastify().withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(seriesRoutes, {
      prefix: '/api',
      series,
      match,
      config,
      onSeriesChanged: () => {
        seriesChanged += 1;
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('GET /series returns the (empty) history alongside live standings', async () => {
    match.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1, kills: 2 })] }));

    const response = await app.inject({ method: 'GET', url: '/api/series' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.document.closedMaps).toEqual([]);
    expect(body.standings.find((t: { teamNo: number }) => t.teamNo === 1).eliminations).toBe(2);
  });

  it('POST /series/close-map closes the running map and notifies the caller', async () => {
    match.applyUpdate(
      update({
        players: [
          player({ teamNo: 1, slot: 1, kills: 1, liveState: 'alive' }),
          player({ teamNo: 2, slot: 1, kills: 0, liveState: 'dead' }),
        ],
      }),
    );

    const response = await app.inject({ method: 'POST', url: '/api/series/close-map' });

    expect(response.statusCode).toBe(200);
    expect(response.json().closedMaps).toHaveLength(1);
    expect(seriesChanged).toBe(1);
  });

  it('POST /series/reset clears history', async () => {
    match.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1 })] }));
    await app.inject({ method: 'POST', url: '/api/series/close-map' });

    const response = await app.inject({ method: 'POST', url: '/api/series/reset' });

    expect(response.statusCode).toBe(200);
    expect(response.json().closedMaps).toEqual([]);
  });

  it('PUT /series/maps/:mapId edits a closed map and rejects a bad placement set', async () => {
    match.applyUpdate(
      update({
        players: [
          player({ teamNo: 1, slot: 1, kills: 1, liveState: 'alive' }),
          player({ teamNo: 2, slot: 1, kills: 0, liveState: 'dead' }),
        ],
      }),
    );
    const closed = (await app.inject({ method: 'POST', url: '/api/series/close-map' })).json();
    const mapId = closed.closedMaps[0].id as string;

    const ok = await app.inject({
      method: 'PUT',
      url: `/api/series/maps/${mapId}`,
      payload: {
        teams: [
          { teamNo: 1, placement: 2, eliminations: 3 },
          { teamNo: 2, placement: 1, eliminations: 0 },
        ],
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(
      ok.json().closedMaps[0].teams.find((t: { teamNo: number }) => t.teamNo === 1).placement,
    ).toBe(2);

    const bad = await app.inject({
      method: 'PUT',
      url: `/api/series/maps/${mapId}`,
      payload: {
        teams: [
          { teamNo: 1, placement: 1, eliminations: 0 },
          { teamNo: 2, placement: 1, eliminations: 0 },
        ],
      },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('DELETE /series/maps/:mapId removes a closed map', async () => {
    match.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1 })] }));
    const closed = (await app.inject({ method: 'POST', url: '/api/series/close-map' })).json();
    const mapId = closed.closedMaps[0].id as string;

    const response = await app.inject({ method: 'DELETE', url: `/api/series/maps/${mapId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json().closedMaps).toEqual([]);
  });

  it('DELETE for an unknown map id responds 400 rather than throwing', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/series/maps/does-not-exist' });

    expect(response.statusCode).toBe(400);
  });

  it('POST /series/close-map responds 400 when there is no match to close', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/series/close-map' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/no match running/);
    expect(series.getState().closedMaps).toEqual([]);
    expect(seriesChanged).toBe(0);
  });

  it('POST /series/close-map responds 400 during warmup, never recording an unplayed round', async () => {
    // Manual close forces `projectAsEnded()`, which hands every team in the lobby a final
    // placement regardless of what the real phase reads — a fabricated map, worth real points, in
    // the permanent history, unless this check stops it.
    match.applyUpdate(
      update({
        inWarmup: true,
        players: [player({ teamNo: 1, slot: 1 }), player({ teamNo: 2, slot: 1 })],
      }),
    );

    const response = await app.inject({ method: 'POST', url: '/api/series/close-map' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/warming up/);
    expect(series.getState().closedMaps).toEqual([]);
    expect(seriesChanged).toBe(0);
  });

  it('POST /series/close-map responds 400 when a match id outlived its player list', async () => {
    // A match id can still be reported after the payload has been cleared. Recording the empty map
    // that results is the same nuisance as recording one with no match at all.
    match.applyUpdate(update({ players: [] }));

    const response = await app.inject({ method: 'POST', url: '/api/series/close-map' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/nothing to record/);
    expect(series.getState().closedMaps).toEqual([]);
  });

  it('POST /series/close-map responds 400 rather than recording the same match twice', async () => {
    match.applyUpdate(update({ players: [player({ teamNo: 1, slot: 1, kills: 1 })] }));
    await app.inject({ method: 'POST', url: '/api/series/close-map' });

    const second = await app.inject({ method: 'POST', url: '/api/series/close-map' });

    expect(second.statusCode).toBe(400);
    expect(second.json().error).toMatch(/already been closed/);
    expect(series.getState().closedMaps).toHaveLength(1);
  });

  it('POST /series/maps adds a map at the requested position and renumbers', async () => {
    for (const eliminations of [0, 1]) {
      await app.inject({
        method: 'POST',
        url: '/api/series/maps',
        payload: { position: 99, teams: [{ teamNo: 1, placement: 1, eliminations }] },
      });
    }

    const response = await app.inject({
      method: 'POST',
      url: '/api/series/maps',
      payload: {
        position: 1,
        teams: [
          { teamNo: 1, placement: 1, eliminations: 4 },
          { teamNo: 2, placement: 2, eliminations: 2 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const maps = response.json().closedMaps;
    expect(maps.map((map: { mapNumber: number }) => map.mapNumber)).toEqual([1, 2, 3]);
    expect(maps[0].teams).toHaveLength(2); // The new one really did land first.
    expect(maps[0].endedAt).toBeNull();
    expect(maps[0].matchId).toBeNull();
    expect(seriesChanged).toBe(3);
  });

  it('POST /series/maps responds 400 for two teams sharing a placement', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/series/maps',
      payload: {
        position: 1,
        teams: [
          { teamNo: 1, placement: 1, eliminations: 0 },
          { teamNo: 2, placement: 1, eliminations: 0 },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(series.getState().closedMaps).toEqual([]);
  });
});
