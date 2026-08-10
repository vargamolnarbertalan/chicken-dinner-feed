import { existsSync } from 'node:fs';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StoredFont {
  fileName: string;
  url: string;
}

/**
 * Font formats a browser can actually use in `@font-face`, identified by their leading bytes.
 *
 * `.ttf` and `.otf` are what an operator will have to hand — a brand's typeface arrives as desktop
 * files, not as web fonts — so both are accepted even though `.woff2` would be smaller. Over
 * loopback the size difference is irrelevant.
 */
const SIGNATURES: { extension: string; magic: number[] }[] = [
  { extension: 'ttf', magic: [0x00, 0x01, 0x00, 0x00] },
  { extension: 'ttf', magic: [0x74, 0x72, 0x75, 0x65] }, // 'true'
  { extension: 'ttf', magic: [0x74, 0x74, 0x63, 0x66] }, // 'ttcf', a TrueType collection
  { extension: 'otf', magic: [0x4f, 0x54, 0x54, 0x4f] }, // 'OTTO'
  { extension: 'woff', magic: [0x77, 0x4f, 0x46, 0x46] }, // 'wOFF'
  { extension: 'woff2', magic: [0x77, 0x4f, 0x46, 0x32] }, // 'wOF2'
];

export const MAX_FONT_BYTES = 8 * 1024 * 1024;

/** Strip the extension and tidy it into something usable as a CSS family name. */
export function familyNameFrom(originalName: string): string {
  const withoutExtension = originalName.replace(/\.[^.]+$/, '');
  const cleaned = withoutExtension
    .replace(/[_-]+/g, ' ')
    // Split camel case, so "MyCustomFont" reads as "My Custom Font".
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    // Quotes and backslashes would break the CSS declaration this ends up inside.
    .replace(/['"\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return (cleaned || 'Custom font').slice(0, 60);
}

/**
 * Uploaded font files on disk.
 *
 * Kept as files next to the logos rather than embedded in configuration: a font is a megabyte or
 * two of binary, and inlining it would make the config unreadable to the operator who is supposed
 * to be able to open it (ADR-0004).
 */
export class FontStore {
  private readonly directory: string;

  constructor(dataDir: string) {
    this.directory = path.join(dataDir, 'fonts');
  }

  get root(): string {
    return this.directory;
  }

  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  /** Identified from the file's own bytes; the extension an operator typed proves nothing. */
  detectFormat(bytes: Buffer): string | null {
    for (const { extension, magic } of SIGNATURES) {
      if (magic.every((byte, index) => bytes[index] === byte)) return extension;
    }
    return null;
  }

  async save(family: string, bytes: Buffer, now: number = Date.now()): Promise<StoredFont> {
    const extension = this.detectFormat(bytes);
    if (!extension) {
      throw new Error('That file is not a TTF, OTF, WOFF or WOFF2 font.');
    }

    await this.init();

    // Derived from the family so the file is recognisable in the data folder, and slugged so it is
    // safe in a URL and on every filesystem.
    const slug =
      family
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'font';
    const fileName = `${slug}.${extension}`;
    const target = path.join(this.directory, fileName);

    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);

    return { fileName, url: `/api/fonts/${fileName}?v=${now}` };
  }

  async remove(fileName: string): Promise<void> {
    // The name comes from our own stored document, but joining a caller-supplied string into a path
    // is exactly where traversal bugs live, so it is reduced to a bare file name first.
    const safe = path.basename(fileName);
    const target = path.join(this.directory, safe);

    if (!existsSync(target)) return;
    await unlink(target).catch(() => {
      // Already gone is the outcome we wanted.
    });
  }
}
