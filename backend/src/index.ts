import { mkdirSync } from 'node:fs';
import { buildApp } from './app.js';
import { config } from './config.js';

async function main(): Promise<void> {
  mkdirSync(config.dataDir, { recursive: true });

  const { app, start, shutdown } = await buildApp();

  let shuttingDown = false;
  const stop = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'Shutting down');
    await shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    // Port conflicts are the most likely startup failure on an operator's machine, and the default
    // Fastify error does not say what to do about it.
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      app.log.fatal(
        `Port ${config.port} is already in use. Either another copy of chicken-dinner-feed is ` +
          `already running, or another program has taken the port. Close it, or set PORT in ` +
          `backend/.env to a free port.`,
      );
    } else {
      app.log.fatal(error, 'Failed to start');
    }
    process.exit(1);
  }

  // Ingestion starts only once the server is accepting connections, so an overlay that reconnects
  // the instant the port opens is never told about state it is about to be sent anyway.
  start();

  app.log.info(
    {
      url: `http://${config.host}:${config.port}`,
      ingestSource: config.ingestSource,
      dataDir: config.dataDir,
    },
    'chicken-dinner-feed is ready',
  );
}

void main();
