import { useEffect, useRef } from 'react';
import type { ClosedMapResult } from '@cdf/shared';

export interface MapTeamEditValue {
  placement: number;
  eliminations: number;
}

export interface EditMapDialogProps {
  /** The map being corrected, or null when the dialog should be closed. */
  map: ClosedMapResult | null;
  values: Record<number, MapTeamEditValue>;
  teamName(teamNo: number): string;
  onChange(teamNo: number, changes: Partial<MapTeamEditValue>): void;
  onCancel(): void;
  onSave(): void;
}

/**
 * Full-width correction form for one closed map, as its own modal rather than expanding inline in
 * the (deliberately compact, side-by-side) finished-maps grid — a per-row label above each input
 * only had room to misalign itself in a narrow card; full width gives placement and eliminations
 * columns their own header row and consistent alignment down the whole team list.
 */
export function EditMapDialog({
  map,
  values,
  teamName,
  onChange,
  onCancel,
  onSave,
}: EditMapDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = map !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onCancel={onCancel}
      className="bg-card text-foreground border-border m-auto w-[min(48rem,calc(100vw-2rem))] rounded-lg border p-0 shadow-xl backdrop:bg-black/50"
    >
      {map && (
        <div className="grid gap-3 p-5">
          <h2 className="text-base font-semibold">Correct map {map.mapNumber}</h2>
          <p className="text-muted-foreground text-sm">
            Points are always recalculated from the scoring ruleset — enter the real placement and
            elimination count, not the points themselves.
          </p>

          <div className="grid max-h-[60vh] gap-1 overflow-y-auto">
            <div className="text-muted-foreground grid grid-cols-[1fr_6rem_6rem] gap-2 px-1 text-xs">
              <span>Team</span>
              <span>Placement</span>
              <span>Elims</span>
            </div>
            {map.teams.map((team) => (
              <div
                key={team.teamNo}
                className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2 px-1 py-0.5"
              >
                <span className="truncate text-sm">{teamName(team.teamNo)}</span>
                <input
                  type="number"
                  min={1}
                  aria-label={`${teamName(team.teamNo)} placement`}
                  className="border-border bg-background rounded border px-2 py-1.5 text-sm"
                  value={values[team.teamNo]?.placement ?? team.placement}
                  onChange={(event) =>
                    onChange(team.teamNo, { placement: Number(event.target.value) })
                  }
                />
                <input
                  type="number"
                  min={0}
                  aria-label={`${teamName(team.teamNo)} eliminations`}
                  className="border-border bg-background rounded border px-2 py-1.5 text-sm"
                  value={values[team.teamNo]?.eliminations ?? team.eliminations}
                  onChange={(event) =>
                    onChange(team.teamNo, { eliminations: Number(event.target.value) })
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="border-border hover:bg-secondary rounded border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium"
            >
              Save correction
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
