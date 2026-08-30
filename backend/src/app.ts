import { existsSync } from 'node:fs';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { config } from './config.js';
import { createIngestSource } from './ingest/index.js';
import { ConfigStore } from './persistence/config-store.js';
import { FontStore, MAX_FONT_BYTES } from './persistence/font-store.js';
import { LogoStore, MAX_LOGO_BYTES } from './persistence/logo-store.js';
import { backupRoutes } from './routes/backup.js';
import { configRoutes } from './routes/config.js';
import { feedbackRoutes } from './routes/feedback.js';
import { fontRoutes } from './routes/fonts.js';
import { logoRoutes } from './routes/logos.js';
import { healthRoutes } from './routes/health.js';
import { overlayControlRoutes } from './routes/overlay-control.js';
import { seriesRoutes } from './routes/series.js';
import { MatchStore } from './state/match-store.js';
import { OverlayControlStore } from './state/overlay-control-store.js';
import { SeriesStore } from './state/series-store.js';
import { LiveHub } from './ws/live-hub.js';
import { liveRoutes } from './ws/routes.js';

/** The live pipeline, exposed so `index.ts` can start and stop it around the server's lifecycle. */
export interface AppContext {
  app: FastifyInstance;
  start(): void;
  shutdown(): Promise<void>;
}

export async function buildApp(): Promise<AppContext> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      ...(config.isProduction
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }),
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod is the single source of truth for validation, serialisation and the OpenAPI document
  // (ADR-0005) — these two compilers are what make that true rather than aspirational.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'chicken-dinner-feed API',
        description:
          'Local API for configuring overlays and observing live PUBG Mobile match state. ' +
          'Intended to be reached over loopback only — it has no authentication (ADR-0008).',
        version: '0.1.0',
      },
      servers: [{ url: `http://${config.host}:${config.port}` }],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(fastifySwaggerUi, { routePrefix: '/api/docs' });

  // The admin and the overlays are served from this same origin, so CORS is not needed for them.
  // It is enabled for loopback only, so that a browser source pointed at 127.0.0.1 from a differently
  // spelled host (localhost) still works.
  await app.register(fastifyCors, {
    origin: [/^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/],
  });

  await app.register(fastifyWebsocket);
  await app.register(fastifyMultipart, {
    limits: { fileSize: Math.max(MAX_LOGO_BYTES, MAX_FONT_BYTES), files: 1 },
  });

  // Configuration is loaded before anything else so a malformed file stops startup with a readable
  // message, rather than surfacing as a broken overlay once the operator is on air (ADR-0004).
  const configStore = new ConfigStore({
    dataDir: config.dataDir,
    onWarn: (message, detail) => app.log.error({ detail }, message),
  });
  await configStore.load();

  const logoStore = new LogoStore(config.dataDir);
  await logoStore.init();

  const fontStore = new FontStore(config.dataDir);
  await fontStore.init();

  const seriesStore = new SeriesStore({
    dataDir: config.dataDir,
    onWarn: (message, detail) => app.log.error({ detail }, message),
  });
  await seriesStore.load();

  // The live pipeline: adapter → store → hub → sockets. Assembled here so nothing downstream has to
  // know which ingestion source is in use (ADR-0006).
  const store = new MatchStore({
    source: config.ingestSource,
    roster: configStore.teams.current.teams,
    ruleset: configStore.scoring.current,
  });
  store.setSeriesContext(seriesStore.getSeriesTotals(), seriesStore.getSeriesHasAppeared());
  const overlayControl = new OverlayControlStore();
  const hub = new LiveHub({
    store,
    overlayControl,
    resolveInstance: (instanceId) => configStore.findInstance(instanceId),
    listFonts: () => configStore.fonts.current.fonts,
    listInstanceIds: () => configStore.instances.current.instances.map((instance) => instance.id),
  });
  const ingestSource = createIngestSource(config.ingestSource, {
    pcobBaseUrl: config.pcobBaseUrl,
    pcobPollMs: config.pcobPollMs,
    pcobTimeoutMs: config.pcobTimeoutMs,
    // Field-mapping warnings go through the app logger so they land in the same place an operator
    // is already looking. Each distinct message is emitted once per run, not once per poll.
    log: (message) => app.log.warn({ source: 'pcob' }, message),
    // Rehearsing with the mock should mean rehearsing with the operator's own configured roster
    // (imported from an ini, typically), not the built-in stand-in names — otherwise editing the
    // roster silently has no effect on what the mock actually simulates.
    roster: configStore.teams.current.teams,
  });

  // Configuration changes have to reach the live path immediately: a new scoring ruleset changes
  // the standings on air, and an appearance change must reach open browser sources without a reload.
  configStore.subscribe((change) => {
    switch (change) {
      case 'teams':
        store.setRoster(configStore.teams.current.teams);
        ingestSource.setRoster?.(configStore.teams.current.teams);
        hub.schedulePublish();
        break;
      case 'scoring':
        store.setRuleset(configStore.scoring.current);
        hub.schedulePublish();
        break;
      case 'instances':
      case 'fonts':
        // A font uploaded mid-setup has to reach open browser sources without a reload.
        hub.refreshAllOverlayStates();
        break;
    }
  });

  if (config.isNetworkExposed) {
    app.log.warn(
      { host: config.host, controlToken: config.controlToken ? 'set' : 'not set' },
      config.controlToken
        ? 'Listening beyond loopback. The admin UI has no authentication — only the control ' +
            'endpoints are token-protected.'
        : 'Listening beyond loopback with no CONTROL_TOKEN set. Anyone on this network can reach ' +
            'the admin UI and show or hide your overlays.',
    );
  }

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(overlayControlRoutes, {
    prefix: '/api',
    store: overlayControl,
    isConfigured: (instanceId) => configStore.findInstance(instanceId) !== null,
  });
  await app.register(configRoutes, { prefix: '/api', store: configStore });

  // Refreshes what `MatchStore` adds on top of this map's own points, after anything that can change
  // the series total: a new ingest update, or an operator action on the Series control page (close
  // now, add by hand, reset, edit, delete) — maps are recorded only by an explicit operator action,
  // never on their own; see the note on `SeriesStore.observeMatch`.
  //
  // Also re-derives how much of the currently displayed match is *already* in that total, which is
  // why this must run on every ingest update and not only on an operator action — the displayed
  // match changes on its own.
  const refreshSeriesContext = (): void => {
    store.setSeriesContext(
      seriesStore.getSeriesTotals(),
      seriesStore.getSeriesHasAppeared(),
      seriesStore.getBankedPointsForMatch(store.currentMatchId()),
    );
  };

  await app.register(seriesRoutes, {
    prefix: '/api',
    series: seriesStore,
    match: store,
    config: configStore,
    onSeriesChanged: () => {
      refreshSeriesContext();
      hub.schedulePublish();
    },
  });

  // Import & Export (specs, "Import & Export"): the four config documents an import writes go
  // through ConfigStore's own save methods, so the subscribe listener above already refreshes the
  // roster, ruleset and open browser sources exactly as a normal operator edit would. Only the
  // series history bypasses ConfigStore, so it needs the same explicit refresh onSeriesChanged does.
  await app.register(backupRoutes, {
    prefix: '/api',
    config: configStore,
    series: seriesStore,
    logos: logoStore,
    fonts: fontStore,
    onImported: () => {
      refreshSeriesContext();
      hub.schedulePublish();
    },
  });

  // Deliberately not under /api: this is the address an operator types into a Companion button.
  // Registered before the static plugin so its exact route wins over the SPA wildcard.
  await app.register(feedbackRoutes, {
    store: configStore,
    overlayControl,
    matchStore: store,
    hub,
  });

  await app.register(logoRoutes, { prefix: '/api', logos: logoStore, config: configStore });
  await app.register(fontRoutes, { prefix: '/api', fonts: fontStore, config: configStore });

  // Team logos are operator files, not build output, so they are served from the data directory.
  // `decorateReply: false` because the frontend's static plugin already owns `reply.sendFile`.
  await app.register(fastifyStatic, {
    root: logoStore.root,
    prefix: '/api/logos/',
    decorateReply: false,
  });
  await app.register(fastifyStatic, {
    root: fontStore.root,
    prefix: '/api/fonts/',
    decorateReply: false,
  });
  await app.register(liveRoutes, { prefix: '/ws', hub });

  // Serving the built frontend is what makes the bundle a single process (ADR-0001). In a fresh
  // checkout the frontend may not be built yet; that must not stop the API from starting.
  if (existsSync(config.staticDir)) {
    await app.register(fastifyStatic, { root: config.staticDir });

    // The frontend is a single-page app: unknown non-API paths are client routes, not 404s.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        return reply.code(404).send({ error: 'Not found', path: request.url });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.log.warn(
      { staticDir: config.staticDir },
      'Built frontend not found — serving the API only. Run `npm run build` to serve the UI from here.',
    );
  }

  return {
    app,

    start() {
      hub.start();
      ingestSource.start({
        onUpdate(update) {
          store.applyUpdate(update);
          // Never closes a map itself — see the note on `SeriesStore.observeMatch`. Only tracks the
          // current match's start time for a later manual close, which is why nothing here reads a
          // return value or needs to hold broadcasting for it.
          seriesStore
            .observeMatch(store.project(), Date.now())
            .catch((error: unknown) => app.log.error({ error }, 'Failed to record series history'))
            .finally(() => {
              refreshSeriesContext();
              hub.schedulePublish();
            });
        },
        onStatus(state, message) {
          store.setStatus(state, message ?? null);
          app.log.info({ state, message }, 'Ingest status changed');
          hub.schedulePublish();
        },
      });
    },

    async shutdown() {
      // Stop producing before tearing down consumers, so nothing publishes into a closed hub.
      await ingestSource.stop();
      hub.stop();
      await app.close();
    },
  };
}
