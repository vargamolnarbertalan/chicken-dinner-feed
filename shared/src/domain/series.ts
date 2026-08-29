import { z } from 'zod';
import { CONFIG_SCHEMA_VERSION } from '../versions.js';

/**
 * One team's result in a map that has already closed.
 *
 * Deliberately mirrors `Team`'s point fields rather than storing a single opaque total: an operator
 * correcting a wrong auto-detected result edits `placement`/`eliminations` (the raw inputs), and
 * `killPoints`/`placementPoints`/`totalPoints` are always re-derived from the scoring ruleset, never
 * accepted as a direct override — the same rule that governs live scoring.
 */
export const closedMapTeamResultSchema = z.object({
  teamNo: z.number().int().min(1).max(25),
  /** 1-based, unique within the map — enforced when a map is closed or edited. */
  placement: z.number().int().min(1),
  eliminations: z.number().int().min(0),
  killPoints: z.number().int().min(0),
  placementPoints: z.number().int().min(0),
  totalPoints: z.number().int().min(0),
});
export type ClosedMapTeamResult = z.infer<typeof closedMapTeamResultSchema>;

/**
 * One map's final result, permanently recorded once it closes.
 *
 * `mapName` stays null in practice today — the PCOB API exposes no field naming the map (Erangel,
 * Miramar, ...), confirmed against every field alias in `payload.ts` and the vendor documents
 * (`specs/PCOB-API.md`). Modelled as nullable rather than omitted so a future API version that does
 * expose it needs no shape change here.
 *
 * `startedAt` is nullable: a backend restart mid-map loses the moment the map actually started, and
 * that must read as "unknown" rather than as a fabricated, wrong timestamp.
 */
export const closedMapResultSchema = z.object({
  /** Server-generated, stable identity for editing/deleting this specific map later. */
  id: z.string().min(1),
  /** 1-based, sequential within the current series. Renumbered on delete so it stays contiguous. */
  mapNumber: z.number().int().min(1),
  mapName: z.string().min(1).nullable(),
  startedAt: z.number().int().nullable(),
  endedAt: z.number().int(),
  teams: z.array(closedMapTeamResultSchema),
});
export type ClosedMapResult = z.infer<typeof closedMapResultSchema>;

/**
 * The persisted series/tournament history (ADR-0004).
 *
 * `seriesId` changes on every reset — a cheap, unambiguous way for a client to notice "this is a
 * different series now" without comparing the whole document.
 */
export const seriesDocumentSchema = z.object({
  schemaVersion: z.number().int().min(1),
  seriesId: z.string().min(1),
  closedMaps: z.array(closedMapResultSchema),
});
export type SeriesDocument = z.infer<typeof seriesDocumentSchema>;

/**
 * Takes the new id as a parameter rather than generating one: this package has no Node-only or
 * DOM-only APIs (it is imported by both the backend and the browser), so id generation belongs to
 * the caller, which has `node:crypto` available.
 */
export function createDefaultSeriesDocument(seriesId: string): SeriesDocument {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    seriesId,
    closedMaps: [],
  };
}
