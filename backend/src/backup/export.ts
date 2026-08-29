import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { BACKUP_FORMAT_VERSION, type BackupManifest } from '@cdf/shared';
import { APP_VERSION } from '../version.js';
import type { ConfigStore } from '../persistence/config-store.js';
import type { SeriesStore } from '../state/series-store.js';
import type { LogoStore } from '../persistence/logo-store.js';
import type { FontStore } from '../persistence/font-store.js';

export interface ExportDependencies {
  config: ConfigStore;
  series: SeriesStore;
  logos: LogoStore;
  fonts: FontStore;
}

/** Every entry name the export/import pipeline agrees on — the single source of truth for both. */
export const BACKUP_ENTRIES = {
  manifest: 'manifest.json',
  overlayInstances: 'overlay-instances.json',
  teamRoster: 'team-roster.json',
  scoringRuleset: 'scoring-ruleset.json',
  customFonts: 'custom-fonts.json',
  series: 'series.json',
  logosDir: 'logos/',
  fontsDir: 'fonts/',
} as const;

/**
 * Everything the operator can carry from one machine to another (specs, "Import & Export").
 *
 * Deliberately excluded, and why:
 * - `.env` — machine-specific (network binding, the PCOB API's address). Copying it verbatim could
 *   silently point the new machine at the wrong observer or the wrong port.
 * - Overlay show/hide state — never persisted at all (ADR-0012): "a restart should give a known
 *   state, not resurrect whatever was on screen." There is nothing here to export.
 * - Live match/ingest state — meaningless on a different machine; a match in progress is not a
 *   setting.
 */
export async function buildExportZip(deps: ExportDependencies): Promise<Buffer> {
  const zip = new AdmZip();

  const manifest: BackupManifest = {
    backupFormatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: Date.now(),
    appVersion: APP_VERSION,
  };

  zip.addFile(BACKUP_ENTRIES.manifest, jsonBuffer(manifest));
  zip.addFile(BACKUP_ENTRIES.overlayInstances, jsonBuffer(deps.config.instances.current));
  zip.addFile(BACKUP_ENTRIES.teamRoster, jsonBuffer(deps.config.teams.current));
  zip.addFile(BACKUP_ENTRIES.scoringRuleset, jsonBuffer(deps.config.scoring.current));
  zip.addFile(BACKUP_ENTRIES.customFonts, jsonBuffer(deps.config.fonts.current));
  zip.addFile(BACKUP_ENTRIES.series, jsonBuffer(deps.series.getState()));

  await addDirectory(zip, BACKUP_ENTRIES.logosDir, deps.logos.root);
  await addDirectory(zip, BACKUP_ENTRIES.fontsDir, deps.fonts.root);

  return zip.toBuffer();
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2));
}

/** Every regular file directly inside `directory`, added under `zipPrefix` — never recurses. */
async function addDirectory(zip: AdmZip, zipPrefix: string, directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const bytes = await readFile(path.join(directory, entry.name));
    zip.addFile(`${zipPrefix}${entry.name}`, bytes);
  }
}
