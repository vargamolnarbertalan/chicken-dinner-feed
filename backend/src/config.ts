import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadDotenv({ path: path.join(packageRoot, '.env'), quiet: true });

/**
 * Where the built frontend lives.
 *
 * Two layouts have to work: a developer checkout, where the frontend is a sibling workspace, and a
 * release bundle, where the static assets sit next to the backend (ADR-0009). Rather than encode a
 * build-time flag, we detect the bundle layout and fall back to the checkout layout.
 */
function defaultStaticDir(): string {
  const bundled = path.join(packageRoot, 'public');
  return existsSync(bundled) ? bundled : path.resolve(packageRoot, '../frontend/dist');
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  PORT: z.coerce.number().int().min(1).max(65535).default(4317),
  HOST: z.string().min(1).default('127.0.0.1'),

  DATA_DIR: z.string().min(1).default('./data'),
  STATIC_DIR: z.string().min(1).optional(),

  /** See ADR-0006. `mock` needs no game running; `pcob` polls the real observer API. */
  INGEST_SOURCE: z.enum(['mock', 'pcob']).default('mock'),

  /**
   * Where the PCOB API answers.
   *
   * A full origin rather than a port, because the API binds every interface — ob.js calls
   * `listen(10086)` with no host — so it is reachable from another machine on the venue LAN
   * (ADR-0010, specs/PCOB-API.md §1). Point this at the OB PC when our app runs elsewhere.
   */
  PCOB_BASE_URL: z.string().url().default('http://127.0.0.1:10086'),

  /** The upstream refreshes about every 2 s, so polling faster than this gains nothing. */
  PCOB_POLL_INTERVAL_MS: z.coerce.number().int().min(200).max(10_000).default(1000),

  /**
   * Per-request timeout.
   *
   * Required rather than optional: ob.js leaves the socket open for a route it does not handle
   * instead of returning a 404, so without this a mistake would hang the poll loop silently
   * (specs/PCOB-API.md §1).
   */
  PCOB_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(800),

  /**
   * Optional shared secret for the overlay control endpoints. Empty means no check, which is right
   * while the server is on loopback. Only relevant if HOST is opened up so a stream deck on another
   * machine can reach it.
   */
  CONTROL_TOKEN: z.string().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // This runs before the logger exists, and an operator may be looking at a console window that
  // closes on exit — so the message has to be readable on its own.
  console.error('Invalid configuration. Check backend/.env against backend/.env.example:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  logLevel: env.LOG_LEVEL,
  host: env.HOST,
  port: env.PORT,
  packageRoot,
  dataDir: path.resolve(packageRoot, env.DATA_DIR),
  staticDir: env.STATIC_DIR ? path.resolve(packageRoot, env.STATIC_DIR) : defaultStaticDir(),
  ingestSource: env.INGEST_SOURCE,
  pcobBaseUrl: env.PCOB_BASE_URL,
  pcobPollMs: env.PCOB_POLL_INTERVAL_MS,
  pcobTimeoutMs: env.PCOB_REQUEST_TIMEOUT_MS,
  controlToken: env.CONTROL_TOKEN,
  /** True when the server is reachable from outside this machine — see ADR-0012. */
  isNetworkExposed: env.HOST !== '127.0.0.1' && env.HOST !== 'localhost',
} as const;

export type AppConfig = typeof config;
