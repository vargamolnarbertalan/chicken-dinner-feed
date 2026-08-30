import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { JsonDocument } from './json-document.js';

const schema = z.object({
  schemaVersion: z.number().int(),
  label: z.string().min(1),
});
type Doc = z.infer<typeof schema>;

const createDefault = (): Doc => ({ schemaVersion: 1, label: 'default' });

describe('JsonDocument', () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'cdf-persistence-'));
    filePath = path.join(dir, 'nested', 'doc.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function makeDocument(): JsonDocument<Doc> {
    return new JsonDocument({ filePath, schema, createDefault });
  }

  it('seeds the defaults, and the directory, on first load', async () => {
    const document = makeDocument();

    const loaded = await document.load();

    expect(loaded).toEqual(createDefault());
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual(createDefault());
  });

  it('reads back what it wrote', async () => {
    const document = makeDocument();
    await document.load();

    await document.write({ schemaVersion: 1, label: 'edited' });

    const reopened = makeDocument();
    expect(await reopened.load()).toEqual({ schemaVersion: 1, label: 'edited' });
  });

  it('leaves no temporary files behind', async () => {
    // A stray .tmp beside the config would be confusing to an operator poking around the folder.
    const document = makeDocument();
    await document.load();

    await document.write({ schemaVersion: 1, label: 'edited' });

    expect(await readdir(path.dirname(filePath))).toEqual(['doc.json']);
  });

  it('rejects an invalid write without touching the stored file', async () => {
    // Validating before writing is what stops a bad save destroying a good configuration.
    const document = makeDocument();
    await document.load();
    await document.write({ schemaVersion: 1, label: 'good' });

    await expect(document.write({ schemaVersion: 1, label: '' } as Doc)).rejects.toThrow();

    expect(JSON.parse(await readFile(filePath, 'utf8')).label).toBe('good');
    expect(document.current.label).toBe('good');
  });

  it('fails loudly on a file that is not valid JSON', async () => {
    // These files are meant to be hand-editable, so a mangled edit must stop startup rather than
    // load half-populated and produce a subtly wrong overlay mid-broadcast.
    const document = makeDocument();
    await document.load();
    await writeFile(filePath, '{ not json', 'utf8');

    await expect(makeDocument().load()).rejects.toThrow(/not valid JSON/);
  });

  it('fails loudly on a file that parses but does not match the schema', async () => {
    const document = makeDocument();
    await document.load();
    await writeFile(filePath, JSON.stringify({ schemaVersion: 1 }), 'utf8');

    await expect(makeDocument().load()).rejects.toThrow(/does not match the expected format/);
  });

  it('refuses to serve a value before it has been loaded', async () => {
    expect(() => makeDocument().current).toThrow(/has not been loaded/);
  });

  it('updates the in-memory value only after a successful write', async () => {
    const document = makeDocument();
    await document.load();

    await document.write({ schemaVersion: 1, label: 'first' });
    expect(document.current.label).toBe('first');

    await expect(document.write({ schemaVersion: 1, label: '' } as Doc)).rejects.toThrow();
    expect(document.current.label).toBe('first');
  });

  describe('concurrent writes', () => {
    it('never lets the in-memory value diverge from what actually landed on disk', async () => {
      // Regression: reproduced directly before this fix — two `write()` calls fired without an
      // `await` between them shared one PID-named temp file. One `rename` consumed it out from
      // under the other, and `current` ended up describing a write that was not the one on disk.
      const document = makeDocument();
      await document.load();

      const first = document.write({ schemaVersion: 1, label: 'first' });
      const second = document.write({ schemaVersion: 1, label: 'second' });
      await Promise.all([first, second]);

      const onDisk = JSON.parse(await readFile(filePath, 'utf8')) as Doc;
      expect(document.current).toEqual(onDisk);
    });

    it('resolves both calls, in the order they were queued, rather than dropping one', async () => {
      const document = makeDocument();
      await document.load();

      const first = document.write({ schemaVersion: 1, label: 'first' });
      const second = document.write({ schemaVersion: 1, label: 'second' });

      await expect(first).resolves.toMatchObject({ label: 'first' });
      await expect(second).resolves.toMatchObject({ label: 'second' });
      expect(document.current.label).toBe('second');
    });

    it('a write that fails validation does not block a later write from succeeding', async () => {
      // A rejected promise short-circuits every `.then()` chained onto it — without swallowing the
      // failure internally, one bad write would wedge every write after it on this instance.
      const document = makeDocument();
      await document.load();

      const bad = document.write({ schemaVersion: 1, label: '' } as Doc); // Fails `min(1)`.
      const good = document.write({ schemaVersion: 1, label: 'ok' });

      await expect(bad).rejects.toThrow();
      await expect(good).resolves.toMatchObject({ label: 'ok' });

      // And the instance keeps working normally afterwards.
      await document.write({ schemaVersion: 1, label: 'still fine' });
      expect(document.current.label).toBe('still fine');
    });

    it('serializes many overlapping writes without losing or corrupting any of them', async () => {
      const document = makeDocument();
      await document.load();

      await Promise.all(
        Array.from({ length: 20 }, (_unused, index) =>
          document.write({ schemaVersion: 1, label: `label-${index}` }),
        ),
      );

      const onDisk = JSON.parse(await readFile(filePath, 'utf8')) as Doc;
      expect(document.current).toEqual(onDisk); // Whichever one landed last, both agree which.
      expect(onDisk.label).toMatch(/^label-\d+$/);
    });
  });
});
