import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { familyNameFrom, FontStore } from './font-store.js';

const TTF = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x0a]);
const OTF = Buffer.from([0x4f, 0x54, 0x54, 0x4f, 0x00]);
const WOFF2 = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0x00]);

describe('familyNameFrom', () => {
  it('drops the extension', () => {
    expect(familyNameFrom('mcustomfont.ttf')).toBe('mcustomfont');
  });

  it('splits camel case, so an uploaded file reads as words', () => {
    expect(familyNameFrom('MyCustomFont.otf')).toBe('My Custom Font');
  });

  it('treats underscores and hyphens as spaces', () => {
    expect(familyNameFrom('Barlow_Condensed-Bold.woff2')).toBe('Barlow Condensed Bold');
  });

  it('removes characters that would break the CSS declaration it lands in', () => {
    expect(familyNameFrom(`we'ird"name\\.ttf`)).toBe('weirdname');
  });

  it('falls back to something usable when nothing is left', () => {
    expect(familyNameFrom('.ttf')).toBe('Custom font');
  });
});

describe('FontStore', () => {
  let dir: string;
  let store: FontStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cdf-fonts-'));
    store = new FontStore(dir);
    await store.init();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('identifies formats from the file bytes, not the name', () => {
    expect(store.detectFormat(TTF)).toBe('ttf');
    expect(store.detectFormat(OTF)).toBe('otf');
    expect(store.detectFormat(WOFF2)).toBe('woff2');
  });

  it('rejects a file that is not a font', () => {
    expect(store.detectFormat(Buffer.from('this is a text file'))).toBeNull();
  });

  it('refuses to store something that is not a font', async () => {
    await expect(store.save('Whatever', Buffer.from('nope'))).rejects.toThrow(/not a TTF/);
  });

  it('stores the file under a slug of the family, with the detected extension', async () => {
    const saved = await store.save('My Custom Font', OTF, 1000);

    expect(saved.fileName).toBe('my-custom-font.otf');
    expect(await readFile(path.join(store.root, saved.fileName))).toEqual(OTF);
  });

  it('gives the URL a version, so a replaced font is not served from cache', async () => {
    const saved = await store.save('My Font', TTF, 4242);

    expect(saved.url).toBe('/api/fonts/my-font.ttf?v=4242');
  });

  it('leaves no temporary files behind', async () => {
    await store.save('My Font', TTF);

    expect(await readdir(store.root)).toEqual(['my-font.ttf']);
  });

  it('removes a stored font', async () => {
    const saved = await store.save('My Font', TTF);

    await store.remove(saved.fileName);

    expect(await readdir(store.root)).toEqual([]);
  });

  it('cannot be talked into deleting outside its own directory', async () => {
    // The name comes from our own document, but joining a caller-supplied string into a path is
    // exactly where traversal bugs live.
    await store.save('Keep Me', TTF);

    await store.remove('../../../etc/passwd');

    expect(await readdir(store.root)).toEqual(['keep-me.ttf']);
  });

  it('treats removing a font that is already gone as success', async () => {
    await expect(store.remove('never-existed.ttf')).resolves.toBeUndefined();
  });
});
