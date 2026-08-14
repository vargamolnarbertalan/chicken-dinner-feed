import { config } from '../config.js';

/**
 * Optional shared secret, off by default.
 *
 * Loopback binding is the real control (ADR-0008). This exists for the one setup that needs more:
 * Companion running on a different machine, which requires binding to the network and therefore
 * exposes these endpoints to anyone on the venue LAN. It is a speed bump against accidents and
 * curious people on the same network, not authentication.
 *
 * Shared by the control endpoints and `/feedback` so that the two cannot drift apart. An operator
 * who has configured a token has one rule to remember, and a reader can see that the document
 * describing the overlays is guarded exactly as tightly as the buttons that change them.
 *
 * @returns an operator-readable reason to reject, or null to allow.
 */
export function controlTokenRejection(
  provided: string | undefined,
  header: unknown,
): string | null {
  if (!config.controlToken) return null;
  const supplied = provided ?? (typeof header === 'string' ? header : undefined);
  return supplied === config.controlToken ? null : 'Invalid or missing control token.';
}

/**
 * The header alternative to the `token` query parameter.
 *
 * Both are accepted: a query parameter is what Companion's HTTP module sets most easily, a header
 * is what keeps the secret out of proxy and server logs.
 */
export const CONTROL_TOKEN_HEADER = 'x-control-token';
