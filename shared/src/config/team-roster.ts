import { z } from 'zod';
import { CONFIG_SCHEMA_VERSION } from '../versions.js';

/**
 * What the overlay prints for a given PCOB team slot.
 *
 * `teamNo` is the join key: the PCOB API keys everything by team number, and the operator's
 * `TeamLogoAndColor.ini` uses the same numbering (specs/PCOB-FINDINGS.md §3). Names and logos are
 * ours to configure — the game supplies neither.
 */
export const teamRosterEntrySchema = z.object({
  teamNo: z.number().int().min(1).max(25),
  name: z.string().min(1).max(60),
  /** What the overlay actually prints. The reference uses 2–5 characters. */
  shortName: z.string().min(1).max(8),
  /** Null until the operator supplies a logo. */
  logoUrl: z.string().nullable(),
});
export type TeamRosterEntry = z.infer<typeof teamRosterEntrySchema>;

export const teamRosterDocumentSchema = z.object({
  schemaVersion: z.number().int().min(1),
  teams: z.array(teamRosterEntrySchema),
});
export type TeamRosterDocument = z.infer<typeof teamRosterDocumentSchema>;

/**
 * The sixteen teams from `specs/example.png`.
 *
 * A recognisable default beats sixteen rows of `TEAM 01`: an operator opening the admin for the
 * first time sees what the overlay will look like, and edits from there.
 */
export const DEFAULT_TEAM_ROSTER: TeamRosterDocument = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  teams: [
    { teamNo: 1, name: 'Megalodon', shortName: 'MGLZ', logoUrl: null },
    { teamNo: 2, name: 'Alpha Gaming', shortName: 'APG', logoUrl: null },
    { teamNo: 3, name: 'Cloud One', shortName: 'C1', logoUrl: null },
    { teamNo: 4, name: 'Twisted', shortName: 'TWIST', logoUrl: null },
    { teamNo: 5, name: 'Scarlet Crew', shortName: 'SC', logoUrl: null },
    { teamNo: 6, name: 'Eternal', shortName: 'ETN', logoUrl: null },
    { teamNo: 7, name: 'Kingz', shortName: 'KNZ', logoUrl: null },
    { teamNo: 8, name: 'Etcetera', shortName: 'ETC', logoUrl: null },
    { teamNo: 9, name: 'Stellar', shortName: 'STR', logoUrl: null },
    { teamNo: 10, name: 'Section 4', shortName: 'SE4', logoUrl: null },
    { teamNo: 11, name: 'Echo Five', shortName: 'E5', logoUrl: null },
    { teamNo: 12, name: 'Exodus', shortName: 'EXDS', logoUrl: null },
    { teamNo: 13, name: 'Zenith West', shortName: 'ZEW', logoUrl: null },
    { teamNo: 14, name: 'Matrix Four', shortName: 'M4', logoUrl: null },
    { teamNo: 15, name: 'Two Alpha', shortName: '2A', logoUrl: null },
    { teamNo: 16, name: 'Nocturne', shortName: 'NC', logoUrl: null },
  ],
};
