/**
 * Structural comparison of two plain JSON values.
 *
 * Used to decide whether an overlay has unsaved changes. `JSON.stringify` would be shorter but
 * depends on key order, so an edit that rebuilt an object with the same values in a different order
 * would read as a change — and the Save button would stay lit with nothing to save.
 *
 * Only handles what the configuration actually contains: objects, arrays, and primitives.
 */
export function isDeepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => isDeepEqual(item, b[index]));
  }

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);

  if (keys.length !== Object.keys(right).length) return false;

  return keys.every((key) => Object.hasOwn(right, key) && isDeepEqual(left[key], right[key]));
}
