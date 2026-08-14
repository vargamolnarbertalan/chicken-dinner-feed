import { CONFIG_SCHEMA_VERSION } from '@cdf/shared';

/**
 * Forward migrations for persisted configuration.
 *
 * ADR-0004 put a `schemaVersion` in every document precisely so a newer bundle could carry an
 * operator's existing setup forward instead of discarding it. This is where that promise is kept:
 * documents are migrated **before** schema validation, so a config written by an older version
 * loads rather than stopping the app with "does not match the expected format".
 *
 * Migrations are written defensively. The input is whatever happened to be on disk, so nothing may
 * be assumed about its shape — an unrecognised value falls back to a sane default rather than
 * throwing, because refusing to start is a worse outcome than one setting reverting.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * v1 → v2: the animation gained a type, and direction became one of four edges.
 *
 * Before, a single `direction` field carried both ideas: `fade` meant "no movement", and the four
 * compass values meant "slide from there". Splitting them is what lets wipe and zoom-fade exist
 * without multiplying the list.
 */
const DIRECTION_V1_TO_V2: Record<string, string> = {
  left: 'left',
  right: 'right',
  up: 'top',
  down: 'bottom',
};

function migrateAnimationV1(raw: unknown): Record<string, unknown> {
  const old = isRecord(raw) ? raw : {};
  const oldDirection = typeof old['direction'] === 'string' ? old['direction'] : 'left';

  /*
   * Duration bounds widened from 0–3000 to 100–5000, so an existing value is kept as it is and only
   * clamped if it falls outside. Deliberately not snapped to the slider's 50 ms step: a migration
   * changes the shape of a document, not the operator's settings, and a range input displays an
   * off-step value perfectly well — it only snaps once someone drags it.
   */
  const duration = typeof old['durationMs'] === 'number' ? old['durationMs'] : 420;

  return {
    type: oldDirection === 'fade' ? 'fade' : 'slide',
    direction: DIRECTION_V1_TO_V2[oldDirection] ?? 'left',
    durationMs: Math.min(5000, Math.max(100, Math.round(duration))),
    easing: typeof old['easing'] === 'string' ? old['easing'] : 'smooth',
    // Everything animated with a cross-fade before the switch existed, so preserving the look means
    // defaulting it on.
    withFade: true,
    rows: { enabled: false, staggerMs: 60, reverseOnHide: false },
  };
}

/** Bring an overlay-instances document up to the current schema version. */
export function migrateOverlayInstances(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  const version = typeof raw['schemaVersion'] === 'number' ? raw['schemaVersion'] : 0;
  if (version >= CONFIG_SCHEMA_VERSION) return raw;

  const instances = Array.isArray(raw['instances']) ? raw['instances'] : [];

  return {
    ...raw,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    instances: instances.map((instance) => {
      if (!isRecord(instance)) return instance;
      const appearance = isRecord(instance['appearance']) ? instance['appearance'] : {};

      return {
        ...instance,
        appearance: {
          ...appearance,
          animation: migrateAnimationV1(appearance['animation']),
        },
      };
    }),
  };
}

/**
 * Documents whose shape did not change still carry the version number, so bumping it keeps every
 * file consistent and makes "which version wrote this" answerable from any one of them.
 */
export function migrateSchemaVersionOnly(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  const version = typeof raw['schemaVersion'] === 'number' ? raw['schemaVersion'] : 0;
  if (version >= CONFIG_SCHEMA_VERSION) return raw;

  return { ...raw, schemaVersion: CONFIG_SCHEMA_VERSION };
}
