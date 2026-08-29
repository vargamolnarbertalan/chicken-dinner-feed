import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import {
  BACKUP_FORMAT_VERSION,
  backupManifestSchema,
  customFontsDocumentSchema,
  overlayInstancesDocumentSchema,
  scoringRulesetSchema,
  seriesDocumentSchema,
  teamRosterDocumentSchema,
  type BackupManifest,
  type BackupSummary,
  type CustomFontsDocument,
  type OverlayInstancesDocument,
  type ScoringRuleset,
  type SeriesDocument,
  type TeamRosterDocument,
} from '@cdf/shared';
import type { ZodType } from 'zod';
import {
  migrateOverlayInstances,
  migrateSchemaVersionOnly,
  migrateTeamRoster,
} from '../persistence/migrations.js';
import { BACKUP_ENTRIES, type ExportDependencies } from './export.js';

export interface ValidatedImport {
  manifest: BackupManifest;
  instances: OverlayInstancesDocument;
  teams: TeamRosterDocument;
  scoring: ScoringRuleset;
  fonts: CustomFontsDocument;
  series: SeriesDocument;
  /** File name (no path) → bytes, exactly as they will be written back to disk. */
  logoFiles: Map<string, Buffer>;
  fontFiles: Map<string, Buffer>;
  summary: BackupSummary;
}

export type ImportValidationResult =
  { ok: true; value: ValidatedImport } | { ok: false; errors: string[] };

/**
 * Validates a whole backup ZIP and returns everything ready to write — or every problem found,
 * without having touched anything on disk. Nothing is applied until every document parses, migrates
 * forward cleanly (the same `migrate` functions a document loaded from disk normally runs), and every
 * file a document refers to (a team's logo, a custom font's own file) is actually present in the
 * archive. A single bad entry must not leave the app half-imported.
 */
export function validateImportZip(buffer: Buffer): ImportValidationResult {
  const errors: string[] = [];

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (cause) {
    return { ok: false, errors: [`Not a valid ZIP file. (${String(cause)})`] };
  }

  const manifest = parseEntry(
    zip,
    BACKUP_ENTRIES.manifest,
    backupManifestSchema,
    (raw) => raw,
    errors,
  );
  if (manifest && manifest.backupFormatVersion > BACKUP_FORMAT_VERSION) {
    errors.push(
      `This backup (format v${manifest.backupFormatVersion}) was made with a newer version of the ` +
        `app than this one understands (v${BACKUP_FORMAT_VERSION}). Update the app before importing it.`,
    );
  }

  const instances = parseEntry(
    zip,
    BACKUP_ENTRIES.overlayInstances,
    overlayInstancesDocumentSchema,
    migrateOverlayInstances,
    errors,
  );
  const teams = parseEntry(
    zip,
    BACKUP_ENTRIES.teamRoster,
    teamRosterDocumentSchema,
    migrateTeamRoster,
    errors,
  );
  const scoring = parseEntry(
    zip,
    BACKUP_ENTRIES.scoringRuleset,
    scoringRulesetSchema,
    migrateSchemaVersionOnly,
    errors,
  );
  const fonts = parseEntry(
    zip,
    BACKUP_ENTRIES.customFonts,
    customFontsDocumentSchema,
    migrateSchemaVersionOnly,
    errors,
  );
  const series = parseEntry(
    zip,
    BACKUP_ENTRIES.series,
    seriesDocumentSchema,
    migrateSchemaVersionOnly,
    errors,
  );

  if (!manifest || !instances || !teams || !scoring || !fonts || !series) {
    return { ok: false, errors };
  }

  const logoFiles = readDirectoryEntries(zip, BACKUP_ENTRIES.logosDir);
  const fontFiles = readDirectoryEntries(zip, BACKUP_ENTRIES.fontsDir);

  for (const team of teams.teams) {
    if (team.logoUrl === null) continue;
    const fileName = fileNameFromLogoUrl(team.logoUrl);
    if (!logoFiles.has(fileName)) {
      errors.push(
        `Team ${team.teamNo} (${team.name}) refers to a logo file ("${fileName}") that is not in ` +
          `the backup.`,
      );
    }
  }

  for (const font of fonts.fonts) {
    if (!fontFiles.has(font.fileName)) {
      errors.push(
        `Custom font "${font.family}" refers to a file ("${font.fileName}") that is not in the ` +
          `backup.`,
      );
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      manifest,
      instances,
      teams,
      scoring,
      fonts,
      series,
      logoFiles,
      fontFiles,
      summary: {
        overlayInstances: instances.instances.length,
        teams: teams.teams.length,
        logos: logoFiles.size,
        customFonts: fonts.fonts.length,
        closedMaps: series.closedMaps.length,
      },
    },
  };
}

/**
 * Writes everything a validated import contains. Only ever called with the output of
 * `validateImportZip`'s success case — every document here is already schema-valid.
 *
 * Binary files are written before the config documents that reference them: saving a document
 * through `ConfigStore`'s normal methods immediately notifies open browser sources (the same
 * listener wiring a manual edit already goes through — ADR-0004), so the files it points to should
 * already be on disk first, not a moment later.
 */
export async function applyImport(
  validated: ValidatedImport,
  deps: ExportDependencies,
): Promise<void> {
  await replaceDirectory(deps.logos.root, validated.logoFiles);
  await replaceDirectory(deps.fonts.root, validated.fontFiles);

  await deps.config.saveTeams(validated.teams);
  await deps.config.saveScoring(validated.scoring);
  await deps.config.saveInstances(validated.instances.instances);
  await deps.config.saveFonts(validated.fonts.fonts);
  await deps.series.replaceState(validated.series);
}

function parseEntry<T>(
  zip: AdmZip,
  entryName: string,
  schema: ZodType<T>,
  migrate: (raw: unknown) => unknown,
  errors: string[],
): T | null {
  const entry = zip.getEntry(entryName);
  if (!entry) {
    errors.push(`Missing "${entryName}" in the backup.`);
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(zip.readAsText(entry));
  } catch (cause) {
    errors.push(`"${entryName}" is not valid JSON. (${String(cause)})`);
    return null;
  }

  const migrated = migrate(raw);
  const result = schema.safeParse(migrated);
  if (!result.success) {
    errors.push(
      `"${entryName}" does not match the expected format. First problem: ` +
        `${result.error.issues[0]?.message ?? 'unknown'}.`,
    );
    return null;
  }

  return result.data;
}

/** Every file directly inside `zipPrefix`, keyed by its bare file name — never recurses. */
function readDirectoryEntries(zip: AdmZip, zipPrefix: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (!entry.entryName.startsWith(zipPrefix)) continue;
    const relative = entry.entryName.slice(zipPrefix.length);
    if (relative === '' || relative.includes('/')) continue; // Not directly inside, skip.
    files.set(relative, zip.readFile(entry) ?? Buffer.alloc(0));
  }
  return files;
}

/** `logoUrl` is `/api/logos/<fileName>?v=...` — strip the query string and any path down to the name. */
function fileNameFromLogoUrl(logoUrl: string): string {
  return path.basename(logoUrl.split('?')[0] ?? logoUrl);
}

async function replaceDirectory(
  directory: string,
  files: ReadonlyMap<string, Buffer>,
): Promise<void> {
  await mkdir(directory, { recursive: true });

  const existing = await readdir(directory).catch(() => []);
  for (const name of existing) {
    await unlink(path.join(directory, name)).catch(() => {
      // Already gone is the outcome we wanted.
    });
  }

  for (const [name, bytes] of files) {
    await writeFile(path.join(directory, name), bytes);
  }
}
