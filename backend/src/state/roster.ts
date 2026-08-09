/**
 * Team display metadata: what the overlay prints for a given PCOB team slot.
 *
 * The PCOB API keys everything by team number; names and logos come from the operator's
 * configuration, not from the game (specs/PCOB-FINDINGS.md §3).
 *
 * TODO: this becomes a persisted, admin-editable document in the persistence slice (ADR-0004).
 * Until then it is an in-memory default so the pipeline has something to render.
 */
export interface TeamRosterEntry {
  teamNo: number;
  name: string;
  shortName: string;
  logoUrl: string | null;
}

/**
 * The sixteen teams from `specs/example.png`, so the mock source renders as the visual reference we
 * are building against rather than as `TEAM 01 … TEAM 16`.
 */
export const DEFAULT_TEAM_ROSTER: readonly TeamRosterEntry[] = [
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
];
