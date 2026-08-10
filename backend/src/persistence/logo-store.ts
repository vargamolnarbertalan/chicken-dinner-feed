import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StoredLogo {
  /** Path the frontend requests. Carries a version so a replaced logo is not served from cache. */
  url: string;
  fileName: string;
}

interface FormatRule {
  extension: string;
  /** Leading bytes that identify the format. Undefined for SVG, which is checked as text. */
  magic?: number[];
}

/**
 * Accepted image formats.
 *
 * SVG is included deliberately: overlays run at up to 4K and a vector logo is the only thing that
 * stays sharp there (ADR-0011). It is safe in this context because logos are rendered through
 * `<img>`, which does not execute scripts inside an SVG — but it would not be safe to inline, so
 * nothing should start doing that.
 */
const FORMATS: FormatRule[] = [
  { extension: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  { extension: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { extension: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
  { extension: 'svg' },
];

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Team logos on disk.
 *
 * Stored as files rather than inlined into the roster document, so a 4K-ready PNG does not turn the
 * configuration into something an operator can no longer open in Notepad — and so copying the data
 * directory between machines still carries the logos with it (ADR-0004).
 */
export class LogoStore {
  private readonly directory: string;

  constructor(dataDir: string) {
    this.directory = path.join(dataDir, 'logos');
  }

  get root(): string {
    return this.directory;
  }

  async init(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  /**
   * Identify the format from the file's own bytes, not from the name or the declared content type.
   *
   * Both of those come from the client and can be wrong — sometimes innocently, when an operator
   * renames a JPEG to `.png` because a tool asked for one.
   */
  detectFormat(bytes: Buffer): string | null {
    for (const format of FORMATS) {
      if (!format.magic) continue;
      if (format.magic.every((byte, index) => bytes[index] === byte)) return format.extension;
    }

    const head = bytes.subarray(0, 512).toString('utf8').trimStart().toLowerCase();
    if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'svg';

    return null;
  }

  async save(teamNo: number, bytes: Buffer, now: number = Date.now()): Promise<StoredLogo> {
    const extension = this.detectFormat(bytes);
    if (!extension) {
      throw new Error('That file is not a PNG, JPEG, WebP or SVG image.');
    }

    await this.init();
    // A team keeps one logo, so replacing it means removing whatever format was there before.
    await this.remove(teamNo);

    const fileName = `team-${teamNo}.${extension}`;
    const target = path.join(this.directory, fileName);

    // Written beside the target and renamed into place, so a browser source polling for the file
    // never sees a half-written image.
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);

    return { fileName, url: this.urlFor(fileName, now) };
  }

  async remove(teamNo: number): Promise<boolean> {
    if (!existsSync(this.directory)) return false;

    const prefix = `team-${teamNo}.`;
    const matches = (await readdir(this.directory)).filter((name) => name.startsWith(prefix));

    for (const name of matches) {
      await unlink(path.join(this.directory, name)).catch(() => {
        // Already gone is the outcome we wanted.
      });
    }

    return matches.length > 0;
  }

  /**
   * The version query is what makes a replaced logo actually appear. Without it a browser source
   * that has been open all day keeps showing the old image from cache.
   */
  urlFor(fileName: string, version: number = Date.now()): string {
    return `/api/logos/${fileName}?v=${version}`;
  }
}
