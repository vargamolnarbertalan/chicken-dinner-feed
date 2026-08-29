import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../persistence/config-store.js';
import { FontStore } from '../persistence/font-store.js';
import { LogoStore } from '../persistence/logo-store.js';
import { MatchStore } from '../state/match-store.js';
import { SeriesStore } from '../state/series-store.js';
import { buildExportZip, type ExportDependencies } from './export.js';
import { applyImport, validateImportZip } from './import.js';

async function makeDeps(dataDir: string): Promise<ExportDependencies> {
  const config = new ConfigStore({ dataDir });
  await config.load();
  const series = new SeriesStore({ dataDir });
  await series.load();
  const logos = new LogoStore(dataDir);
  await logos.init();
  const fonts = new FontStore(dataDir);
  await fonts.init();
  return { config, series, logos, fonts };
}

describe('backup export/import', () => {
  let sourceDir: string;
  let targetDir: string;

  beforeEach(async () => {
    sourceDir = await mkdtemp(path.join(tmpdir(), 'cdf-backup-source-'));
    targetDir = await mkdtemp(path.join(tmpdir(), 'cdf-backup-target-'));
  });

  afterEach(async () => {
    await rm(sourceDir, { recursive: true, force: true });
    await rm(targetDir, { recursive: true, force: true });
  });

  it('round-trips config, logos, fonts and series history onto a fresh install', async () => {
    const source = await makeDeps(sourceDir);

    await writeFile(
      path.join(source.logos.root, 'team-1.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    // Captured once: urlFor() stamps a fresh timestamp on every call, and the assertion below must
    // compare against the exact string that was actually saved, not a newly generated one.
    const logoUrl = source.logos.urlFor('team-1.png', 1_700_000_000_000);
    await source.config.saveTeams({
      schemaVersion: source.config.teams.current.schemaVersion,
      teams: [{ teamNo: 1, name: 'RGN', logoUrl }],
    });

    await writeFile(path.join(source.fonts.root, 'brand-bold.ttf'), Buffer.from('fake-font-bytes'));
    await source.config.saveFonts([
      {
        family: 'Brand Bold',
        fileName: 'brand-bold.ttf',
        url: '/api/fonts/brand-bold.ttf',
        originalName: 'Brand-Bold.ttf',
      },
    ]);

    const match = new MatchStore({
      source: 'pcob',
      roster: [{ teamNo: 1, name: 'RGN', logoUrl: null }],
    });
    match.applyUpdate({
      matchId: 'm1',
      phase: 'ended',
      players: [
        {
          id: '1-1',
          name: 'P1',
          teamNo: 1,
          slot: 1,
          liveState: 'alive',
          health: 100,
          healthMax: 100,
          kills: 3,
          rank: 0,
        },
      ],
    });
    await source.series.closeMapNow(match.projectAsEnded(), 1_000);

    const zip = await buildExportZip(source);

    const target = await makeDeps(targetDir);
    const validated = validateImportZip(zip);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.value.summary).toEqual({
      overlayInstances: source.config.instances.current.instances.length,
      teams: 1,
      logos: 1,
      customFonts: 1,
      closedMaps: 1,
    });

    await applyImport(validated.value, target);

    expect(target.config.teams.current.teams).toEqual([{ teamNo: 1, name: 'RGN', logoUrl }]);
    expect(target.config.fonts.current.fonts[0]?.family).toBe('Brand Bold');
    expect(await readdir(target.logos.root)).toEqual(['team-1.png']);
    expect(await readdir(target.fonts.root)).toEqual(['brand-bold.ttf']);
    expect(target.series.getState().closedMaps).toHaveLength(1);
  });

  it('replaces existing logo/font files rather than merging with them', async () => {
    const target = await makeDeps(targetDir);
    await writeFile(path.join(target.logos.root, 'team-99.png'), Buffer.from('stale'));

    const source = await makeDeps(sourceDir);
    await writeFile(path.join(source.logos.root, 'team-1.png'), Buffer.from('fresh'));
    await source.config.saveTeams({
      schemaVersion: source.config.teams.current.schemaVersion,
      teams: [{ teamNo: 1, name: 'RGN', logoUrl: source.logos.urlFor('team-1.png') }],
    });

    const validated = validateImportZip(await buildExportZip(source));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    await applyImport(validated.value, target);

    // The stale, unreferenced file from the target's own previous state is gone, not merged in.
    expect(await readdir(target.logos.root)).toEqual(['team-1.png']);
  });

  it('rejects garbage bytes rather than throwing', () => {
    const result = validateImportZip(Buffer.from('this is not a zip file'));
    expect(result.ok).toBe(false);
  });

  it('rejects a backup missing one of the required documents, writing nothing', async () => {
    const source = await makeDeps(sourceDir);
    const zip = await buildExportZip(source);

    // Simulate a corrupted export: re-zip everything except team-roster.json.
    const archive = new AdmZip(zip);
    archive.deleteFile('team-roster.json');

    const result = validateImportZip(archive.toBuffer());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((message) => message.includes('team-roster.json'))).toBe(true);
  });

  it('rejects a team whose referenced logo file is missing from the archive', async () => {
    const source = await makeDeps(sourceDir);
    // A logoUrl pointing at a file that was never actually written/included — a corrupt export.
    await source.config.saveTeams({
      schemaVersion: source.config.teams.current.schemaVersion,
      teams: [{ teamNo: 1, name: 'RGN', logoUrl: '/api/logos/team-1.png?v=1' }],
    });

    const result = validateImportZip(await buildExportZip(source));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((message) => message.includes('team-1.png'))).toBe(true);
  });

  it('rejects a document that fails schema validation, writing nothing', async () => {
    const source = await makeDeps(sourceDir);
    const zip = await buildExportZip(source);

    const archive = new AdmZip(zip);
    archive.updateFile('scoring-ruleset.json', Buffer.from('{"not": "a valid ruleset"}'));

    const result = validateImportZip(archive.toBuffer());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((message) => message.includes('scoring-ruleset.json'))).toBe(true);
  });
});
