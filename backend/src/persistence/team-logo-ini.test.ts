import { describe, expect, it } from 'vitest';
import { deriveShortName, parseTeamLogoIni } from './team-logo-ini.js';

const SAMPLE = `
[/Script/ShadowTrackerExtra.FCustomTeamLogoAndColor]
EnableTeamLogoAndColor=1

TeamLogoAndColor=(TeamNo=1,TeamName=Megalodon,TeamLogoPath=c:/logo/001.png,TeamColorR=0,TeamColorG=0,TeamColorB=255,TeamColorA=255,PlayerColorR=0,PlayerColorG=255,PlayerColorB=0,PlayerColorA=255,CornerMarkPath=,fin)
TeamLogoAndColor=(TeamNo=2,TeamName=Alpha Gaming,TeamLogoPath=c:/logo/002.png,KillInfoPath=c:/logo/002_64.png,TeamColorR=255,fin)
`;

describe('parseTeamLogoIni', () => {
  it('reads team number, name and logo path from a real-world entry', () => {
    expect(parseTeamLogoIni(SAMPLE)).toEqual([
      { teamNo: 1, name: 'Megalodon', logoPath: 'c:/logo/001.png' },
      { teamNo: 2, name: 'Alpha Gaming', logoPath: 'c:/logo/002.png' },
    ]);
  });

  it('tolerates an entry wrapped across lines', () => {
    // The guideline's own sample wraps, and operators edit these by hand.
    const wrapped = `TeamLogoAndColor=(TeamNo=7,TeamName=Kingz,
      TeamLogoPath=c:/logo/007.png,
      TeamColorR=255,fin)`;

    expect(parseTeamLogoIni(wrapped)).toEqual([
      { teamNo: 7, name: 'Kingz', logoPath: 'c:/logo/007.png' },
    ]);
  });

  it('ignores the colour fields, which the guideline says do nothing', () => {
    const parsed = parseTeamLogoIni(SAMPLE)[0];

    expect(Object.keys(parsed ?? {})).toEqual(['teamNo', 'name', 'logoPath']);
  });

  it('sorts by team number regardless of file order', () => {
    const shuffled = `
      TeamLogoAndColor=(TeamNo=3,TeamName=C,fin)
      TeamLogoAndColor=(TeamNo=1,TeamName=A,fin)
    `;

    expect(parseTeamLogoIni(shuffled).map((entry) => entry.teamNo)).toEqual([1, 3]);
  });

  it('keeps the first of a duplicated team number rather than silently overwriting', () => {
    const duplicated = `
      TeamLogoAndColor=(TeamNo=1,TeamName=First,fin)
      TeamLogoAndColor=(TeamNo=1,TeamName=Second,fin)
    `;

    expect(parseTeamLogoIni(duplicated)).toEqual([{ teamNo: 1, name: 'First', logoPath: null }]);
  });

  it('drops entries with an unusable team number instead of failing the whole import', () => {
    // A partial import an operator can correct beats a rejection they cannot.
    const messy = `
      TeamLogoAndColor=(TeamName=No number,fin)
      TeamLogoAndColor=(TeamNo=99,TeamName=Out of range,fin)
      TeamLogoAndColor=(TeamNo=4,TeamName=Fine,fin)
    `;

    expect(parseTeamLogoIni(messy).map((entry) => entry.name)).toEqual(['Fine']);
  });

  it('falls back to a placeholder name and a null path when the fields are absent', () => {
    expect(parseTeamLogoIni('TeamLogoAndColor=(TeamNo=5,fin)')).toEqual([
      { teamNo: 5, name: 'Team 5', logoPath: null },
    ]);
  });

  it('returns nothing for a file with no entries', () => {
    expect(parseTeamLogoIni('EnableTeamLogoAndColor=1')).toEqual([]);
  });
});

describe('deriveShortName', () => {
  it('builds an acronym from multiple words', () => {
    // Better than truncating: "Team Falcons" as "TF" beats "TEAM ".
    expect(deriveShortName('Alpha Gaming')).toBe('AG');
    expect(deriveShortName('Team Falcons')).toBe('TF');
  });

  it('truncates a single word', () => {
    expect(deriveShortName('Megalodon')).toBe('MEGAL');
  });

  it('treats hyphens and underscores as word separators', () => {
    expect(deriveShortName('Zenith-West')).toBe('ZW');
  });

  it('never exceeds the width the overlay column allows', () => {
    expect(deriveShortName('A B C D E F G H').length).toBeLessThanOrEqual(5);
  });

  it('produces something usable for an empty name', () => {
    expect(deriveShortName('   ')).toBe('TEAM');
  });
});
