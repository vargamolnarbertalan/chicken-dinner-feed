export interface IniTeamEntry {
  teamNo: number;
  name: string;
  /** Absolute path on the operator's machine, as written in the ini. Null when not set. */
  logoPath: string | null;
}

/**
 * Matches one `TeamLogoAndColor=(...)` entry, tolerating newlines inside the parentheses.
 *
 * The guideline's own sample wraps entries across lines, and operators edit these by hand, so a
 * line-oriented parser would miss real files.
 */
const ENTRY = /TeamLogoAndColor\s*=\s*\(([^)]*)\)/gi;

function field(body: string, key: string): string | null {
  const match = new RegExp(`(?:^|,)\\s*${key}\\s*=\\s*([^,]*)`, 'i').exec(body);
  return match?.[1]?.trim() || null;
}

/**
 * Read an operator's `TeamLogoAndColor.ini`.
 *
 * This is the file the PCOB client already reads to draw team names and logos in-game
 * (specs/PCOB-FINDINGS.md §3), so anyone running a tournament has one with every team already in
 * it. Importing it beats making them retype 16–25 teams into our admin.
 *
 * Deliberately forgiving: unknown keys are ignored, colour fields are skipped (the guideline says
 * they do nothing yet), entries without a usable team number are dropped rather than failing the
 * whole import. A partial import an operator can correct beats a rejection they cannot.
 */
export function parseTeamLogoIni(text: string): IniTeamEntry[] {
  const entries: IniTeamEntry[] = [];
  const seen = new Set<number>();

  for (const match of text.matchAll(ENTRY)) {
    const body = match[1];
    if (!body) continue;

    const teamNo = Number(field(body, 'TeamNo'));
    if (!Number.isInteger(teamNo) || teamNo < 1 || teamNo > 25) continue;
    // A duplicated team number in the source file would otherwise silently overwrite the first.
    if (seen.has(teamNo)) continue;
    seen.add(teamNo);

    entries.push({
      teamNo,
      name: field(body, 'TeamName') ?? `Team ${teamNo}`,
      logoPath: field(body, 'TeamLogoPath'),
    });
  }

  return entries.sort((a, b) => a.teamNo - b.teamNo);
}
