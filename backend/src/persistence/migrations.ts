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

/**
 * Bring an overlay-instances document up to the current schema version.
 *
 * `CONFIG_SCHEMA_VERSION` is one number shared by every persisted document (ADR-0004), so bumping
 * it for an unrelated document's shape change still runs this function again on an
 * already-migrated one. The animation rewrite below is gated on `version < 2` for exactly that
 * reason: applying `migrateAnimationV1` a second time to an already-v2 animation silently discards
 * whatever `type`, non-`slide` `direction`, `withFade: false` or enabled row stagger the operator
 * had configured, because that function assumes v1 input unconditionally.
 */
export function migrateOverlayInstances(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  const version = typeof raw['schemaVersion'] === 'number' ? raw['schemaVersion'] : 0;
  if (version >= CONFIG_SCHEMA_VERSION) return raw;

  // A malformed `instances` value must fail loud schema validation, not be silently replaced with
  // an empty list and written back over whatever was actually on disk.
  if (!Array.isArray(raw['instances'])) return raw;

  return {
    ...raw,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    instances: raw['instances'].map((instance) => {
      if (!isRecord(instance)) return instance;
      if (version >= 2) return instance; // Already past the only shape change this function makes.

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
 * v2 → v3: a team lost its second name.
 *
 * Every team used to carry both `name` (a long display form) and `shortName` (what the overlay
 * actually printed). The ini a team roster is normally imported from has only one `TeamName=` value
 * per team, so `name` was either a hand-typed extra nobody read on air, or — for an ini import —
 * just a duplicate of the same string `shortName` already held. `shortName` is what operators
 * actually configured and what rendered, so it is what survives as the sole `name` field; the old
 * `name` is discarded.
 */
function migrateTeamNameV2ToV3(team: unknown): unknown {
  if (!isRecord(team)) return team;
  if (typeof team['shortName'] !== 'string') return team; // Already migrated, or never had one.

  const { shortName, name: _oldName, ...rest } = team;
  return { ...rest, name: shortName };
}

/** Bring a team-roster document up to the current schema version. */
export function migrateTeamRoster(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  const version = typeof raw['schemaVersion'] === 'number' ? raw['schemaVersion'] : 0;
  if (version >= CONFIG_SCHEMA_VERSION) return raw;

  // A malformed `teams` value must fail loud schema validation, not be silently replaced with an
  // empty roster and written back over an operator's real, if damaged, tournament team list.
  if (!Array.isArray(raw['teams'])) return raw;

  return {
    ...raw,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    teams: version < 3 ? raw['teams'].map(migrateTeamNameV2ToV3) : raw['teams'],
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
