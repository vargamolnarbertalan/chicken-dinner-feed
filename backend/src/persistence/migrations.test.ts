import {
  CONFIG_SCHEMA_VERSION,
  overlayInstancesDocumentSchema,
  teamRosterDocumentSchema,
} from '@cdf/shared';
import { describe, expect, it } from 'vitest';
import {
  migrateOverlayInstances,
  migrateSchemaVersionOnly,
  migrateTeamRoster,
} from './migrations.js';

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

  it('does not re-run the v1 animation migration on an already-v2 document', () => {
    // The regression this guards against: CONFIG_SCHEMA_VERSION is one number shared by every
    // persisted document (ADR-0004). Bumping it for an unrelated document (e.g. the team roster,
    // v2 -> v3) must not make this function re-migrate an overlay-instances document that was
    // already at v2 — migrateAnimationV1 assumes v1 input unconditionally and would silently
    // discard a real v2 animation's type, direction, withFade and row settings.
    const alreadyV2 = {
      schemaVersion: 2,
      instances: [
        {
          id: 'main',
          name: 'Main',
          type: 'leaderboard',
          appearance: {
            animation: {
              type: 'wipe',
              direction: 'top',
              durationMs: 900,
              easing: 'smooth',
              withFade: false,
              rows: { enabled: true, staggerMs: 120, reverseOnHide: true },
            },
          },
        },
      ],
    };

    const migrated = migrateOverlayInstances(alreadyV2) as typeof alreadyV2;

    expect(migrated.instances[0]?.appearance.animation).toEqual(
      alreadyV2.instances[0]?.appearance.animation,
    );
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

  it('does not coerce a hand-mangled instances value into an empty list', () => {
    // A mangled `instances` (a stray brace turning the array into an object, say) must fail loud
    // schema validation downstream, not get silently replaced with `[]` and written back over
    // whatever the operator actually had on disk.
    const mangled = { schemaVersion: 1, instances: 'not an array' };

    expect(migrateOverlayInstances(mangled)).toBe(mangled);
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

describe('migrateTeamRoster', () => {
  /** What the file on an actual operator's machine looked like before name/shortName collapsed. */
  const V2_DOCUMENT = {
    schemaVersion: 2,
    teams: [
      { teamNo: 3, name: 'HZ', shortName: 'C1', logoUrl: '/api/logos/team-3.png' },
      { teamNo: 4, name: 'N1', shortName: 'TWIST', logoUrl: null },
    ],
  };

  function migrateAndParse(document: unknown) {
    const result = teamRosterDocumentSchema.safeParse(migrateTeamRoster(document));
    if (!result.success) throw new Error(result.error.issues[0]?.message ?? 'invalid');
    return result.data;
  }

  it('turns a real v2 document into something the current schema accepts', () => {
    expect(() => migrateAndParse(V2_DOCUMENT)).not.toThrow();
  });

  it('keeps shortName as the surviving name, discarding the old long name', () => {
    // shortName was what operators actually configured and what rendered on air; the old `name`
    // was frequently unrelated placeholder text nobody ever saw.
    const teams = migrateAndParse(V2_DOCUMENT).teams;

    expect(teams.find((team) => team.teamNo === 3)?.name).toBe('C1');
    expect(teams.find((team) => team.teamNo === 4)?.name).toBe('TWIST');
  });

  it('preserves everything else about the team, logo included', () => {
    const team = migrateAndParse(V2_DOCUMENT).teams.find((entry) => entry.teamNo === 3);

    expect(team?.logoUrl).toBe('/api/logos/team-3.png');
  });

  it('leaves an already-current document untouched', () => {
    const current = { schemaVersion: CONFIG_SCHEMA_VERSION, teams: [] };

    expect(migrateTeamRoster(current)).toBe(current);
  });

  it('leaves a team that has no shortName alone, whatever version tagged it', () => {
    // A document already migrated, or hand-written directly in the new shape.
    const alreadyNew = {
      schemaVersion: 2,
      teams: [{ teamNo: 1, name: 'ONE', logoUrl: null }],
    };

    expect(migrateAndParse(alreadyNew).teams[0]?.name).toBe('ONE');
  });

  it('survives a document mangled by hand rather than throwing', () => {
    expect(() => migrateTeamRoster({ schemaVersion: 2, teams: 'not an array' })).not.toThrow();
    expect(() => migrateTeamRoster({ schemaVersion: 2, teams: [null, 42] })).not.toThrow();
    expect(() => migrateTeamRoster(null)).not.toThrow();
  });

  it('does not coerce a hand-mangled teams value into an empty roster', () => {
    // A mangled `teams` value must fail loud schema validation downstream, not get silently
    // replaced with `[]` and written back over an operator's real tournament team list.
    const mangled = { schemaVersion: 2, teams: 'not an array' };

    expect(migrateTeamRoster(mangled)).toBe(mangled);
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
