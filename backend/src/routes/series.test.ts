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
});
