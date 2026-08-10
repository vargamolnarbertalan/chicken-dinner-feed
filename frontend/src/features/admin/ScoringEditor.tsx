import type { ScoringRuleset } from '@cdf/shared';

export interface ScoringEditorProps {
  ruleset: ScoringRuleset;
  onChange(ruleset: ScoringRuleset): void;
}

/**
 * The scoring ruleset.
 *
 * This exists because the PCOB API supplies no points at all — every number in the PTS column comes
 * from here (specs/PCOB-FINDINGS.md §2.4). Getting it wrong means the standings on air are wrong,
 * which is why the placement table is shown as an editable list rather than hidden behind a preset.
 */
export function ScoringEditor({ ruleset, onChange }: ScoringEditorProps) {
  const setPlacement = (index: number, value: number) => {
    const placementPoints = [...ruleset.placementPoints];
    placementPoints[index] = value;
    onChange({ ...ruleset, placementPoints });
  };

  return (
    <div className="grid gap-6">
      <label className="grid max-w-xs gap-1 text-xs">
        <span className="text-muted-foreground">Points per elimination</span>
        <input
          type="number"
          min={0}
          className="border-border bg-background rounded border px-2 py-1.5 text-sm"
          value={ruleset.pointsPerElimination}
          onChange={(event) =>
            onChange({ ...ruleset, pointsPerElimination: Number(event.target.value) })
          }
        />
      </label>

      <section className="grid gap-3">
        <div>
          <h3 className="text-sm font-medium">Placement points</h3>
          <p className="text-muted-foreground text-xs">
            Awarded when a team is eliminated or the match ends — never while it is still playing.
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {ruleset.placementPoints.map((points, index) => (
            <label key={index} className="grid gap-1 text-xs">
              <span className="text-muted-foreground">
                {index + 1}
                {index === 0 ? 'st' : index === 1 ? 'nd' : index === 2 ? 'rd' : 'th'}
              </span>
              <input
                type="number"
                min={0}
                className="border-border bg-background rounded border px-2 py-1.5 text-sm"
                value={points}
                onChange={(event) => setPlacement(index, Number(event.target.value))}
              />
            </label>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="border-border rounded border px-3 py-1.5 text-xs"
            onClick={() =>
              onChange({ ...ruleset, placementPoints: [...ruleset.placementPoints, 0] })
            }
          >
            Add a position
          </button>
          <button
            type="button"
            className="border-border rounded border px-3 py-1.5 text-xs disabled:opacity-40"
            disabled={ruleset.placementPoints.length <= 1}
            onClick={() =>
              onChange({ ...ruleset, placementPoints: ruleset.placementPoints.slice(0, -1) })
            }
          >
            Remove the last
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          Positions beyond the end of this list score zero.
        </p>
      </section>
    </div>
  );
}
