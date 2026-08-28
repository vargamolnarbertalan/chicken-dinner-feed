import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './version.js';

describe('APP_VERSION', () => {
  it('matches the root package.json version, not a stale hand-copied literal', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
    const { version } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      version: string;
    };

    expect(APP_VERSION).toBe(version);
  });
});
