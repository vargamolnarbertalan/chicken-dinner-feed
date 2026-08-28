import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_OVERLAY_APPEARANCE,
  feedbackDocumentSchema,
  type OverlayInstance,
} from '@cdf/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../persistence/config-store.js';
import { MatchStore } from '../state/match-store.js';
import { OverlayControlStore } from '../state/overlay-control-store.js';
import { LiveHub, type LiveClient } from '../ws/live-hub.js';
import { feedbackRoutes } from './feedback.js';

/** A socket that reports itself open and throws nothing away. */
function fakeClient(): LiveClient {
  return { readyState: 1, send: () => {} };
}

function instance(id: string, name: string, scale = 1): OverlayInstance {
  return {
    id,
    name,
    type: 'leaderboard',
    appearance: { ...structuredClone(DEFAULT_OVERLAY_APPEARANCE), scale },
  };
}

describe('feedback route', () => {
  let app: FastifyInstance;
  let dataDir: string;
  let configStore: ConfigStore;
  let overlayControl: OverlayControlStore;
  let matchStore: MatchStore;
  let hub: LiveHub;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'cdf-feedback-'));

    configStore = new ConfigStore({ dataDir, onWarn: () => {} });
    await configStore.load();
    await configStore.saveInstances([
      instance('main', 'Main leaderboard'),
      instance('lower', 'Alsó sáv'),
    ]);

    overlayControl = new OverlayControlStore();
    matchStore = new MatchStore({ source: 'mock' });
    hub = new LiveHub({ store: matchStore, overlayControl });

    app = Fastify().withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(feedbackRoutes, { store: configStore, overlayControl, matchStore, hub });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function fetchFeedback() {
    const response = await app.inject({ method: 'GET', url: '/feedback' });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  it('matches the published schema exactly', async () => {
    // The schema is the contract a Companion setup is built against. Parsing rather than spot
    // checking means a field quietly changing type fails here rather than on air.
    const result = feedbackDocumentSchema.safeParse(await fetchFeedback());

    expect(result.success).toBe(true);
  });

  it('keys overlays by id, so a button cannot be shifted by an unrelated overlay', async () => {
    const body = await fetchFeedback();

    expect(Object.keys(body.overlays).sort()).toEqual(['lower', 'main']);
    expect(body.overlays.main.name).toBe('Main leaderboard');
    expect(body.overlays.lower.name).toBe('Alsó sáv');
  });

  it('reports visibility, and follows a change made through the control store', async () => {
    expect((await fetchFeedback()).overlays.main.isVisible).toBe(true);

    overlayControl.set('main', false);

    const after = await fetchFeedback();
    expect(after.overlays.main.isVisible).toBe(false);
    expect(after.overlays.main.secondsSinceChange).not.toBeNull();
    // The other overlay is untouched — a director hiding one must not read as hiding both.
    expect(after.overlays.lower.isVisible).toBe(true);
  });

  it('leaves secondsSinceChange null for an overlay nobody has touched', async () => {
    // changedAt is 0 for a state nothing has changed yet. Reporting "56 years ago" would be worse
    // than saying nothing.
    const body = await fetchFeedback();

    expect(body.overlays.main.changedAt).toBe(0);
    expect(body.overlays.main.secondsSinceChange).toBeNull();
  });

  it('counts browser sources but not the admin preview', async () => {
    hub.addClient(fakeClient(), 'main');
    hub.addClient(fakeClient(), 'main', { isPreview: true });
    hub.addClient(fakeClient(), null);

    const body = await fetchFeedback();

    // Three clients are connected to 'main' or observing, but only one is a real browser source.
    expect(body.overlays.main.connectedSources).toBe(1);
    expect(body.overlays.main.hasConnectedSource).toBe(true);
    expect(body.overlays.lower.hasConnectedSource).toBe(false);
  });

  it('reports the data feed as not receiving before anything has arrived', async () => {
    const body = await fetchFeedback();

    expect(body.data.state).toBe('disconnected');
    expect(body.data.isReceivingData).toBe(false);
    expect(body.data.isStale).toBe(false);
    expect(body.data.secondsSinceUpdate).toBeNull();
  });

  it('turns isReceivingData on once the source connects', async () => {
    matchStore.setStatus('connected', null);

    expect((await fetchFeedback()).data.isReceivingData).toBe(true);
  });

  it('builds absolute URLs from the address the request arrived on', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/feedback',
      headers: { host: '192.168.1.50:4317' },
    });
    const body = response.json();

    expect(body.app.baseUrl).toBe('http://192.168.1.50:4317');
    expect(body.overlays.main.url).toBe('http://192.168.1.50:4317/overlay/main');
    expect(body.overlays.main.actions.toggle).toBe(
      'http://192.168.1.50:4317/api/overlays/main/toggle',
    );
  });

  it('refuses to echo a hostile Host header into the URLs it hands out', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/feedback',
      headers: { host: 'evil.example/../../x" onload="' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().app.baseUrl).not.toContain('evil.example');
  });

  it('reports the scale as the percentage the admin shows', async () => {
    await configStore.saveInstances([instance('main', 'Main leaderboard', 1.25)]);

    expect((await fetchFeedback()).overlays.main.appearance.scalePercent).toBe(125);
  });
});
