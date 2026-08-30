import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ZodType } from 'zod';

export interface JsonDocumentOptions<T> {
  /** Absolute path of the document. */
  filePath: string;
  schema: ZodType<T>;
  /** Used when the file does not exist yet. Written to disk on first load. */
  createDefault: () => T;
  /**
   * Brings an older document up to the current shape, before validation.
   *
   * Runs on the raw parsed JSON rather than on a validated value, because a document written by a
   * previous version by definition does not satisfy the current schema — validating first would
   * reject exactly the files this exists to rescue (ADR-0004).
   */
  migrate?: (raw: unknown) => unknown;
  /** Injected so a corrupt file is reported through the app's logger, not console. */
  onWarn?: (message: string, detail: unknown) => void;
}

/**
 * One schema-validated JSON document on disk, held in memory at runtime (ADR-0004).
 *
 * Two properties matter more than anything else here.
 *
 * **Writes are atomic.** Configuration is saved by an operator who may be minutes from going on
 * air, on a machine that might lose power. Serialising straight into the target file risks leaving
 * a truncated document that fails to parse on the next start — losing an entire tournament's setup.
 * So we write a temporary file in the same directory, flush it to the physical disk, and rename it
 * over the target. Rename within a filesystem is atomic: readers see either the whole old file or
 * the whole new one, never a half-written one.
 *
 * **Reads are validated.** These files are meant to be hand-editable, and an operator with Notepad
 * is a supported workflow. A malformed file therefore has to fail loudly at startup, not load
 * half-populated and produce a subtly wrong overlay mid-broadcast.
 *
 * **Writes are serialized within this instance.** Two overlapping `write()` calls sharing the same
 * `${filePath}.${process.pid}.tmp` name is not a hypothetical — confirmed by reproducing it directly
 * (two concurrent writes on one instance): one write's `rename` can consume the temp file out from
 * under the other, and the in-memory `cached` value can end up describing a *different* write than
 * the one that actually landed on disk. A queue, not a lock: each call waits for every earlier one on
 * this instance to settle, success or failure, before its own temp-file dance begins.
 */
export class JsonDocument<T> {
  private readonly options: JsonDocumentOptions<T>;
  private cached: T | null = null;
  /** Every `write()` chains onto this; see the class doc comment. Always a settled-or-pending
   *  promise that itself never rejects, so one failed write cannot wedge every write after it. */
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: JsonDocumentOptions<T>) {
    this.options = options;
  }

  get filePath(): string {
    return this.options.filePath;
  }

  /** In-memory value. Call `load()` once at startup before using this. */
  get current(): T {
    if (this.cached === null) {
      throw new Error(`${this.options.filePath} has not been loaded yet`);
    }
    return this.cached;
  }

  async load(): Promise<T> {
    const { filePath, schema, createDefault, migrate, onWarn } = this.options;

    if (!existsSync(filePath)) {
      const seeded = createDefault();
      await this.write(seeded);
      return seeded;
    }

    const raw = await readFile(filePath, 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      throw new Error(
        `${filePath} is not valid JSON. Fix or delete it — deleting restores the defaults. (${String(cause)})`,
      );
    }

    const migrated = migrate ? migrate(parsed) : parsed;
    const result = schema.safeParse(migrated);
    if (!result.success) {
      onWarn?.(`${filePath} does not match the expected format`, result.error.issues);
      throw new Error(
        `${filePath} does not match the expected format. Fix or delete it — deleting restores ` +
          `the defaults. First problem: ${result.error.issues[0]?.message ?? 'unknown'}`,
      );
    }

    this.cached = result.data;

    // Persist the upgrade so the migration runs once rather than on every start, and so what is on
    // disk matches what the app is using.
    if (JSON.stringify(migrated) !== raw.trim()) {
      await this.write(result.data);
    }

    return result.data;
  }

  /** Validate, persist atomically, then update the in-memory value. Queued — see the class doc comment. */
  async write(value: T): Promise<T> {
    const run = this.writeQueue.then(() => this.writeNow(value));
    // Only the internal chain link swallows a failure — never `run` itself, which is what the
    // caller awaits and must still see fail. Without this, one bad write would permanently wedge
    // every write after it, since a rejected promise short-circuits every `.then()` chained onto it.
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async writeNow(value: T): Promise<T> {
    const { filePath, schema } = this.options;

    // Validate before touching the disk, so an invalid write cannot corrupt a good file.
    const validated = schema.parse(value);

    await mkdir(path.dirname(filePath), { recursive: true });

    // Same directory as the target: rename is only atomic within one filesystem.
    const tempPath = `${filePath}.${process.pid}.tmp`;
    try {
      const handle = await open(tempPath, 'w');
      try {
        await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, 'utf8');
        // Without this the rename can land before the data does, which is precisely the
        // power-cut case the temp-file dance exists to survive.
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tempPath, filePath);
    } catch (cause) {
      await unlink(tempPath).catch(() => {
        // The temp file may not exist; failing to clean it up must not mask the real error.
      });
      throw cause;
    }

    this.cached = validated;
    return validated;
  }
}
