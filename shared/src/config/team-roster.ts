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
  /**
   * What the overlay prints, and the only name a team has.
   *
   * There is no separate "full" name: the ini has just one `TeamName=` value per team
   * (specs/PCOB-FINDINGS.md §3), and a team imported from it gets exactly that value here,
   * unmodified. A prior version invented a second, longer name plus a derived short form; that
   * distinction did not exist in the source data and only meant an operator could edit the field
   * nothing on air ever read.
   */
  name: z.string().min(1).max(24),
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
    { teamNo: 1, name: 'MGLZ', logoUrl: null },
    { teamNo: 2, name: 'APG', logoUrl: null },
    { teamNo: 3, name: 'C1', logoUrl: null },
    { teamNo: 4, name: 'TWIST', logoUrl: null },
    { teamNo: 5, name: 'SC', logoUrl: null },
    { teamNo: 6, name: 'ETN', logoUrl: null },
    { teamNo: 7, name: 'KNZ', logoUrl: null },
    { teamNo: 8, name: 'ETC', logoUrl: null },
    { teamNo: 9, name: 'STR', logoUrl: null },
    { teamNo: 10, name: 'SE4', logoUrl: null },
    { teamNo: 11, name: 'E5', logoUrl: null },
    { teamNo: 12, name: 'EXDS', logoUrl: null },
    { teamNo: 13, name: 'ZEW', logoUrl: null },
    { teamNo: 14, name: 'M4', logoUrl: null },
    { teamNo: 15, name: '2A', logoUrl: null },
    { teamNo: 16, name: 'NC', logoUrl: null },
  ],
};
