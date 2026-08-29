import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A developer's own backend/.env (this repo's included) can set HOST/INGEST_SOURCE explicitly,
// which would otherwise mask the hardcoded schema defaults under test here.
vi.mock('dotenv', () => ({ config: vi.fn() }));

describe('config defaults', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.HOST;
    delete process.env.INGEST_SOURCE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults HOST to every interface, so a remote Companion needs no .env change', async () => {
    vi.resetModules();
    const { config } = await import('./config.js');
    expect(config.host).toBe('0.0.0.0');
    expect(config.isNetworkExposed).toBe(true);
  });

  it('defaults INGEST_SOURCE to the real PCOB adapter', async () => {
    vi.resetModules();
    const { config } = await import('./config.js');
    expect(config.ingestSource).toBe('pcob');
  });
});
