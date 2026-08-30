import { useEffect, useRef, type ReactNode } from 'react';

/**
 * An emptied field or a pasted non-numeric string yields `NaN` from `Number(...)`. The server
 * already rejects a non-integer with a clear 400, but that is a round-trip away — falling back to
 * the previous value keeps the input visibly a number the whole time instead of silently going
 * blank/`NaN` until the operator notices the confirm failed.
 */
function parsedOr(raw: string, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface MapTeamResultValue {
  placement: number;
  eliminations: number;
}

export interface MapResultDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /** Teams to show, in the order they should be listed. */
  teamNos: readonly number[];
  /** Fully populated by the caller — the dialog holds no defaults of its own. */
  values: Record<number, MapTeamResultValue>;
  teamName(teamNo: number): string;
  onChange(teamNo: number, changes: Partial<MapTeamResultValue>): void;
  onCancel(): void;
  onConfirm(): void;
  /** Extra controls above the team grid: where in the series a hand-added map should go. */
  children?: ReactNode;
}

/**
 * Full-width placement/eliminations form for one map, as its own modal rather than expanding inline
 * in the (deliberately compact, side-by-side) finished-maps grid — a per-row label above each input
 * only had room to misalign itself in a narrow card; full width gives placement and eliminations
 * columns their own header row and consistent alignment down the whole team list.
 *
 * Serves both correcting a recorded map and adding one by hand. The two differ only in which teams
 * they list, what they are called, and whether a position picker is shown — not enough to justify
 * two components that would then have to be kept looking identical by hand.
 */
export function MapResultDialog({
  open,
  title,
  description,
  confirmLabel,
  teamNos,
  values,
  teamName,
  onChange,
  onCancel,
  onConfirm,
  children,
}: MapResultDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
      {open && (
        <div className="grid gap-3 p-5">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>

          {children}

          <div className="grid max-h-[60vh] gap-1 overflow-y-auto">
            <div className="text-muted-foreground grid grid-cols-[1fr_6rem_6rem] gap-2 px-1 text-xs">
              <span>Team</span>
              <span>Placement</span>
              <span>Elims</span>
            </div>
            {teamNos.map((teamNo) => (
              <div
                key={teamNo}
                className="grid grid-cols-[1fr_6rem_6rem] items-center gap-2 px-1 py-0.5"
              >
                <span className="truncate text-sm">{teamName(teamNo)}</span>
                <input
                  type="number"
                  min={1}
                  aria-label={`${teamName(teamNo)} placement`}
                  className="border-border bg-background rounded border px-2 py-1.5 text-sm"
                  value={values[teamNo]?.placement ?? 1}
                  onChange={(event) =>
                    onChange(teamNo, {
                      placement: parsedOr(event.target.value, values[teamNo]?.placement ?? 1),
                    })
                  }
                />
                <input
                  type="number"
                  min={0}
                  aria-label={`${teamName(teamNo)} eliminations`}
                  className="border-border bg-background rounded border px-2 py-1.5 text-sm"
                  value={values[teamNo]?.eliminations ?? 0}
                  onChange={(event) =>
                    onChange(teamNo, {
                      eliminations: parsedOr(event.target.value, values[teamNo]?.eliminations ?? 0),
                    })
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
              onClick={onConfirm}
              className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
