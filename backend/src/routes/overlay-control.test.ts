import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OverlayControlStore } from '../state/overlay-control-store.js';
import { overlayControlRoutes } from './overlay-control.js';

describe('overlay control routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify().withTypeProvider<ZodTypeProvider>();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(overlayControlRoutes, { prefix: '/api', store: new OverlayControlStore() });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts a POST that declares JSON but sends no body', async () => {
    // Regression: a stream deck configured to POST sends `content-type: application/json` with an
    // empty body, and the default parser rejected it as FST_ERR_CTP_EMPTY_JSON_BODY. On air that is
    // a dead button caused by a technicality the operator cannot see.
    const response = await app.inject({
      method: 'POST',
      url: '/api/overlays/main/toggle',
      headers: { 'content-type': 'application/json', 'content-length': '0' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ instanceId: 'main', visible: false });
  });

  it('accepts a POST with no content-type at all', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/overlays/main/hide' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ visible: false });
  });

  it('accepts GET, which is what a stream deck sends by default', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/overlays/main/show' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ visible: true });
  });

  it('still parses a real JSON body rather than discarding it', async () => {
    // Tolerating an empty body must not turn into ignoring bodies altogether.
    const response = await app.inject({
      method: 'POST',
      url: '/api/overlays/main/hide',
      headers: { 'content-type': 'application/json' },
      payload: { anything: true },
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects a malformed JSON body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/overlays/main/show',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });

    expect(response.statusCode).toBe(400);
  });

  it('reports state without changing it', async () => {
    await app.inject({ method: 'GET', url: '/api/overlays/main/hide' });

    const first = await app.inject({ method: 'GET', url: '/api/overlays/main/state' });
    const second = await app.inject({ method: 'GET', url: '/api/overlays/main/state' });

    expect(first.json()).toEqual(second.json());
    expect(first.json()).toMatchObject({ visible: false });
  });

  it('keeps instances independent', async () => {
    await app.inject({ method: 'GET', url: '/api/overlays/main/hide' });

    const other = await app.inject({ method: 'GET', url: '/api/overlays/secondary/state' });

    expect(other.json()).toMatchObject({ instanceId: 'secondary', visible: true });
  });

  it('rejects an id that could not be a valid overlay id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/overlays/Not_Valid/state' });

    expect(response.statusCode).toBe(400);
  });

  it('reports a mistyped instance as not found rather than silently succeeding', async () => {
    // Behind a stream deck, a 200 for an overlay that does not exist is indistinguishable from a
    // broken button. Instances became real configured entities in the persistence round, so this is
    // the point ADR-0012 flagged for revisiting.
    const configured = Fastify().withTypeProvider<ZodTypeProvider>();
    configured.setValidatorCompiler(validatorCompiler);
    configured.setSerializerCompiler(serializerCompiler);
    await configured.register(overlayControlRoutes, {
      prefix: '/api',
      store: new OverlayControlStore(),
      isConfigured: (instanceId) => instanceId === 'main',
    });
    await configured.ready();

    const known = await configured.inject({ method: 'GET', url: '/api/overlays/main/state' });
    const unknown = await configured.inject({ method: 'GET', url: '/api/overlays/typo/state' });

    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error).toContain('typo');

    await configured.close();
  });
});
