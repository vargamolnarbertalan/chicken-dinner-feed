/**
 * Tolerant field access for PCOB payloads.
 *
 * Our house style validates with Zod at every boundary (ADR-0005), and at *this* boundary that is
 * the wrong instrument. `ObToolsNew/ob.js` — the vendor's own API server — renames one envelope key
 * and re-serialises the game's payload **without ever inspecting it**
 * (`specs/PCOB-API.md` §2). So:
 *
 * - The **envelope** keys are certain. They are string literals in ob.js, and were confirmed by
 *   running it: `{"playerInfoList":[]}`. Those we assert.
 * - Everything **inside** belongs to the PUBG Mobile client, which the publisher updates on its own
 *   schedule. The vendor's own documents spell the same fields differently across versions
 *   (`survivalTime` / `surviceTime`, `isOutsideBlueCircle` / `isOutSideBlueCircle`). Those we read
 *   tolerantly.
 *
 * A field we fail to find must never blank an overlay mid-broadcast. It degrades to a default and
 * one log line naming the field, which is what turns the first real capture into an answer instead
 * of an investigation.
 */

/** Reports a field problem at most once per process, keyed by call site. */
export type FieldWarner = (message: string) => void;

/**
 * A case-insensitive view of one JSON object.
 *
 * Built once per object rather than per field: a 64-player payload with ~40 fields each would
 * otherwise re-lower-case 2,500 keys on every poll, once a second, for hours.
 */
export class FieldReader {
  private readonly byLowerKey = new Map<string, unknown>();

  constructor(
    source: unknown,
    private readonly warn: FieldWarner,
    /** Prefixed to warnings so a message says which record it came from. */
    private readonly context = '',
  ) {
    if (source && typeof source === 'object') {
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        // First spelling wins. Two keys differing only in case would be a payload bug; picking the
        // first is arbitrary but stable, and the alias list decides which name we asked for anyway.
        const lower = key.toLowerCase();
        if (!this.byLowerKey.has(lower)) this.byLowerKey.set(lower, value);
      }
    }
  }

  /**
   * First alias that is present, or undefined.
   *
   * Aliases are ordered newest-first: the 3.0.0 dictionary name, then the 1.5.0 wire spelling.
   */
  raw(aliases: readonly string[]): unknown {
    for (const alias of aliases) {
      const value = this.byLowerKey.get(alias.toLowerCase());
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  /**
   * A number, or `fallback` when the field is absent or unusable.
   *
   * PCOB sends some numbers as strings (`"GameTime": "161"`), so a numeric string is accepted —
   * being strict here would discard data that is perfectly well-formed for its own format.
   */
  number(aliases: readonly string[], fallback: number, label = aliases[0]): number {
    const value = this.raw(aliases);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (value === undefined) this.warnOnce(`${label} is missing; using ${fallback}`);
    else this.warnOnce(`${label} is not a number (${typeof value}); using ${fallback}`);
    return fallback;
  }

  /** A string, or `fallback`. Numbers are accepted and stringified — ids arrive as both. */
  string(aliases: readonly string[], fallback: string, label = aliases[0]): string {
    const value = this.raw(aliases);
    if (typeof value === 'string' && value !== '') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value === undefined) this.warnOnce(`${label} is missing; using "${fallback}"`);
    return fallback;
  }

  /** Present and non-null, whatever the type. Used to tell "absent" from "absent-looking". */
  has(aliases: readonly string[]): boolean {
    return this.raw(aliases) !== undefined;
  }

  private warnOnce(message: string): void {
    this.warn(this.context ? `${this.context}: ${message}` : message);
  }
}

/**
 * Wraps a logger so each distinct message is emitted once and then counted.
 *
 * At one poll per second a per-occurrence warning would produce 3,600 identical lines an hour and
 * bury the one that matters. The count is what tells an operator whether a field was missing once
 * or for the whole match.
 */
export function createOnceWarner(log: (message: string) => void): {
  warn: FieldWarner;
  counts: ReadonlyMap<string, number>;
} {
  const counts = new Map<string, number>();

  return {
    warn(message) {
      const seen = counts.get(message) ?? 0;
      counts.set(message, seen + 1);
      if (seen === 0) log(message);
    },
    counts,
  };
}
