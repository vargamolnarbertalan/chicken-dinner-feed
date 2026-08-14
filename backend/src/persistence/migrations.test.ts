import { CONFIG_SCHEMA_VERSION, overlayInstancesDocumentSchema } from '@cdf/shared';
import { describe, expect, it } from 'vitest';
import { migrateOverlayInstances, migrateSchemaVersionOnly } from './migrations.js';

/** A document in the shape actually found on an operator's machine before the animation rework. */
const V1_DOCUMENT = {
  schemaVersion: 1,
  instances: [
    {
      id: 'main',
      name: 'Szép tabella',
      type: 'leaderboard',
      appearance: {
        anchor: 'right',
        offsetX: 24,
        offsetY: null,
        scale: 1,
        fontFamily: "'Inter', system-ui, sans-serif",
        colors: {
          background: '#18181b',
          headerBackground: '#0c0c0e',
          rowAltBackground: '#ff00d0',
          text: '#fafafa',
          textMuted: '#a1a1aa',
          accent: '#e11d48',
          playerAlive: '#ef2b2b',
          playerKnocked: '#47f524',
          playerDead: '#52525b',
        },
        animation: { direction: 'right', durationMs: 1500, easing: 'smooth' },
        showLegend: true,
        maxTeams: 16,
      },
    },
  ],
};

function migrateAndParse(document: unknown) {
  const result = overlayInstancesDocumentSchema.safeParse(migrateOverlayInstances(document));
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? 'invalid');
  return result.data;
}

describe('migrateOverlayInstances', () => {
  it('turns a real v1 document into something the current schema accepts', () => {
    // The point of the whole exercise: a config written by an older build must load, not stop the
    // app with a validation error.
    expect(() => migrateAndParse(V1_DOCUMENT)).not.toThrow();
  });

  it('maps the old single direction field onto a type and an edge', () => {
    const animation = migrateAndParse(V1_DOCUMENT).instances[0]?.appearance.animation;

    expect(animation).toMatchObject({ type: 'slide', direction: 'right' });
  });

  it('preserves the operator’s own duration and easing', () => {
    const animation = migrateAndParse(V1_DOCUMENT).instances[0]?.appearance.animation;

    expect(animation?.durationMs).toBe(1500);
    expect(animation?.easing).toBe('smooth');
  });

  it('defaults the fade switch on, because everything cross-faded before it existed', () => {
    const animation = migrateAndParse(V1_DOCUMENT).instances[0]?.appearance.animation;

    expect(animation?.withFade).toBe(true);
  });

  it('leaves the new row animation switched off', () => {
    // Migrating must not change what an operator sees on air.
    const animation = migrateAndParse(V1_DOCUMENT).instances[0]?.appearance.animation;

    expect(animation?.rows).toEqual({ enabled: false, staggerMs: 60, reverseOnHide: false });
  });

  it('translates the old vertical names to the new edges', () => {
    const withDirection = (direction: string) => ({
      ...V1_DOCUMENT,
      instances: [
        {
          ...V1_DOCUMENT.instances[0],
          appearance: {
            ...V1_DOCUMENT.instances[0]!.appearance,
            animation: { direction, durationMs: 400, easing: 'smooth' },
          },
        },
      ],
    });

    expect(migrateAndParse(withDirection('up')).instances[0]?.appearance.animation.direction).toBe(
      'top',
    );
    expect(
      migrateAndParse(withDirection('down')).instances[0]?.appearance.animation.direction,
    ).toBe('bottom');
  });

  it('turns the old "fade" direction into the fade type', () => {
    const faded = {
      ...V1_DOCUMENT,
      instances: [
        {
          ...V1_DOCUMENT.instances[0],
          appearance: {
            ...V1_DOCUMENT.instances[0]!.appearance,
            animation: { direction: 'fade', durationMs: 400, easing: 'linear' },
          },
        },
      ],
    };

    expect(migrateAndParse(faded).instances[0]?.appearance.animation.type).toBe('fade');
  });

  it('keeps a duration that does not sit on the slider step exactly as it was', () => {
    // A migration changes a document's shape, not the operator's settings. Snapping 880 ms to 900
    // would quietly alter what is on air.
    const offStep = {
      ...V1_DOCUMENT,
      instances: [
        {
          ...V1_DOCUMENT.instances[0],
          appearance: {
            ...V1_DOCUMENT.instances[0]!.appearance,
            animation: { direction: 'right', durationMs: 880, easing: 'snappy' },
          },
        },
      ],
    };

    expect(migrateAndParse(offStep).instances[0]?.appearance.animation.durationMs).toBe(880);
  });

  it('brings a duration outside the new bounds into range instead of failing', () => {
    const tooFast = {
      ...V1_DOCUMENT,
      instances: [
        {
          ...V1_DOCUMENT.instances[0],
          appearance: {
            ...V1_DOCUMENT.instances[0]!.appearance,
            animation: { direction: 'left', durationMs: 0, easing: 'smooth' },
          },
        },
      ],
    };

    expect(migrateAndParse(tooFast).instances[0]?.appearance.animation.durationMs).toBe(100);
  });

  it('leaves an already-current document untouched', () => {
    const current = { schemaVersion: CONFIG_SCHEMA_VERSION, instances: [] };

    expect(migrateOverlayInstances(current)).toBe(current);
  });

  it('survives a document mangled by hand rather than throwing', () => {
    // These files are hand-editable, so the migration meets whatever is on disk. Refusing to start
    // is a worse outcome than one setting reverting to a default.
    expect(() =>
      migrateOverlayInstances({ schemaVersion: 1, instances: 'not an array' }),
    ).not.toThrow();
    expect(() =>
      migrateOverlayInstances({ schemaVersion: 1, instances: [null, 42] }),
    ).not.toThrow();
    expect(() => migrateOverlayInstances(null)).not.toThrow();
  });

  it('falls back to a usable animation when the old one was missing entirely', () => {
    const noAnimation = {
      schemaVersion: 1,
      instances: [
        {
          ...V1_DOCUMENT.instances[0],
          appearance: { ...V1_DOCUMENT.instances[0]!.appearance, animation: undefined },
        },
      ],
    };

    expect(migrateAndParse(noAnimation).instances[0]?.appearance.animation.type).toBe('slide');
  });
});

describe('migrateSchemaVersionOnly', () => {
  it('raises the version of a document whose shape did not change', () => {
    const migrated = migrateSchemaVersionOnly({ schemaVersion: 1, teams: [] });

    expect(migrated).toEqual({ schemaVersion: CONFIG_SCHEMA_VERSION, teams: [] });
  });

  it('leaves a current document alone', () => {
    const current = { schemaVersion: CONFIG_SCHEMA_VERSION, teams: [] };

    expect(migrateSchemaVersionOnly(current)).toBe(current);
  });
});
