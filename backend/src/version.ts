import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The version the running server reports.
 *
 * One constant rather than a literal at each call site: `/api/health` and `/feedback` both publish
 * it, and two numbers that are supposed to agree but are edited separately eventually do not — at
 * which point the operator diagnosing a mismatched bundle is reading a lie.
 *
 * Read from a package.json at runtime rather than hardcoded, so it cannot drift from the actual
 * shipped version the way a hand-copied literal did (every release before this one reported
 * "0.1.0" regardless of its real tag). Two levels up from this compiled file's own directory
 * resolves to the repo root in a developer checkout and to the release bundle's generated root
 * package.json in a shipped ZIP (ADR-0009) — both carry the real version.
 */
const packageJsonPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'package.json',
);

// Strip a possible leading BOM: unlike require(), JSON.parse does not tolerate one, and a
// package.json re-saved by a Windows editor or tool can carry it.
let packageJsonText = readFileSync(packageJsonPath, 'utf8');
const BOM_CHAR_CODE = 0xfeff;
if (packageJsonText.charCodeAt(0) === BOM_CHAR_CODE) {
  packageJsonText = packageJsonText.slice(1);
}
const { version } = JSON.parse(packageJsonText) as { version: string };

export const APP_VERSION: string = version;
