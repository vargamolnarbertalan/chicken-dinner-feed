import type { FastifyPluginAsync } from 'fastify';
import type { LiveClient, LiveHub } from './live-hub.js';

export interface LiveRoutesOptions {
  hub: LiveHub;
}

/**
 * The overlay and admin live channel.
 *
 * Deliberately read-only for now: overlays only consume state. Operator commands (show/hide an
 * overlay, trigger an animation) will need client-to-server messages, and this is where they go.
 */
export const liveRoutes: FastifyPluginAsync<LiveRoutesOptions> = async (app, options) => {
  const { hub } = options;

  app.get('/live', { websocket: true }, (socket, request) => {
    const client = socket as unknown as LiveClient;
    hub.addClient(client);
    request.log.debug({ clients: hub.clientCount }, 'Overlay client connected');

    socket.on('close', () => {
      hub.removeClient(client);
      request.log.debug({ clients: hub.clientCount }, 'Overlay client disconnected');
    });

    // A socket error must unregister the client but must never bubble up — one failing browser
    // source cannot be allowed to affect the others.
    socket.on('error', (error: Error) => {
      request.log.warn({ err: error }, 'Overlay client socket error');
      hub.removeClient(client);
    });
  });
};
