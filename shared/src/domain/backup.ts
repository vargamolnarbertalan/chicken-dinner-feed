import { z } from 'zod';

/**
 * Versions the export ZIP's own *shape* — which top-level entries exist and what they mean — kept
 * deliberately separate from `CONFIG_SCHEMA_VERSION`, which versions the shape of one document.
 * A document inside an older backup is still migrated forward the normal way (the same `migrate`
 * functions a fresh app start already runs); this number is for if the *set of files in the ZIP*
 * itself ever changes — a future export gaining a new document a reader must know is optional.
 */
export const BACKUP_FORMAT_VERSION = 1;

export const backupManifestSchema = z.object({
  backupFormatVersion: z.number().int().min(1),
  /** Epoch milliseconds the export was produced. Purely informational — shown to the operator. */
  exportedAt: z.number().int(),
  /** The exporting app's own version, informational only — never used to gate whether import works. */
  appVersion: z.string().min(1),
});
export type BackupManifest = z.infer<typeof backupManifestSchema>;

/**
 * What an import actually contains, shown to the operator before they confirm — not re-derived from
 * the raw archive at display time, so what they are told matches exactly what was validated.
 */
export const backupSummarySchema = z.object({
  overlayInstances: z.number().int().min(0),
  teams: z.number().int().min(0),
  logos: z.number().int().min(0),
  customFonts: z.number().int().min(0),
  closedMaps: z.number().int().min(0),
});
export type BackupSummary = z.infer<typeof backupSummarySchema>;

export const backupPreviewSchema = z.object({
  manifest: backupManifestSchema,
  summary: backupSummarySchema,
});
export type BackupPreview = z.infer<typeof backupPreviewSchema>;
