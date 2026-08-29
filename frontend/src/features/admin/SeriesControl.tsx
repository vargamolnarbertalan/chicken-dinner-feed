import { useEffect, useState } from 'react';
import type { ClosedMapResult, SeriesDocument, Team } from '@cdf/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { api, ApiError } from '@/lib/api';
import { useLiveStore } from '@/stores/live-store';
import { toast } from '@/stores/toast-store';
import { EditMapDialog } from './EditMapDialog';

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface EditValue {
  placement: number;
  eliminations: number;
}

/**
 * Multi-map series scoring (specs/SCORING-LOGIC-UPDATE.md).
 *
 * "Current standings" reads from the same live WebSocket snapshot the overlay itself renders
 * (falling back to a plain fetch before it connects) — the admin can never show a number that
 * disagrees with what is on air. "Finished maps" is this page's own concern: history, correction,
 * and deletion, none of which the overlay needs to know about.
 */
export function SeriesControl() {
  const liveTeams = useLiveStore((state) => state.snapshot?.match.teams ?? null);

  const [seriesDocument, setSeriesDocument] = useState<SeriesDocument | null>(null);
  const [fallbackStandings, setFallbackStandings] = useState<Team[]>([]);
  const [pendingCloseMap, setPendingCloseMap] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ClosedMapResult | null>(null);
  const [editingMap, setEditingMap] = useState<ClosedMapResult | null>(null);
  const [editValues, setEditValues] = useState<Record<number, EditValue>>({});

  const currentStandings = liveTeams ?? fallbackStandings;

  const reload = async () => {
    try {
      const result = await api.getSeries();
      setSeriesDocument(result.document);
      setFallbackStandings(result.standings);
    } catch (error) {
      toast.error('Could not load the series', describe(error));
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const teamName = (teamNo: number): string =>
    currentStandings.find((team) => team.teamNo === teamNo)?.name ?? `Team ${teamNo}`;

  const closeMapNow = async () => {
    setPendingCloseMap(false);
    try {
      setSeriesDocument(await api.closeMapNow());
      toast.success('Map closed', 'It is now part of the series history below.');
    } catch (error) {
      toast.error('Could not close the map', describe(error));
    }
  };

  const resetSeries = async () => {
    setPendingReset(false);
    try {
      setSeriesDocument(await api.resetSeries());
      toast.success(
        'Series reset',
        'History cleared. The currently running map, if any, keeps playing unaffected.',
      );
    } catch (error) {
      toast.error('Could not reset the series', describe(error));
    }
  };

  const deleteMap = async (map: ClosedMapResult) => {
    setPendingDelete(null);
    try {
      setSeriesDocument(await api.deleteClosedMap(map.id));
      toast.success(`Deleted map ${map.mapNumber}`, 'The remaining maps were renumbered.');
    } catch (error) {
      toast.error('Could not delete the map', describe(error));
    }
  };

  const startEditing = (map: ClosedMapResult) => {
    setEditingMap(map);
    setEditValues(
      Object.fromEntries(
        map.teams.map((team) => [
          team.teamNo,
          { placement: team.placement, eliminations: team.eliminations },
        ]),
      ),
    );
  };

  const patchEdit = (teamNo: number, changes: Partial<EditValue>) => {
    setEditValues((previous) => {
      const team = editingMap?.teams.find((entry) => entry.teamNo === teamNo);
      return {
        ...previous,
        [teamNo]: {
          placement: previous[teamNo]?.placement ?? team?.placement ?? 1,
          eliminations: previous[teamNo]?.eliminations ?? team?.eliminations ?? 0,
          ...changes,
        },
      };
    });
  };

  const saveEdit = async () => {
    if (!editingMap) return;
    try {
      const teams = editingMap.teams.map((team) => ({
        teamNo: team.teamNo,
        placement: editValues[team.teamNo]?.placement ?? team.placement,
        eliminations: editValues[team.teamNo]?.eliminations ?? team.eliminations,
      }));
      setSeriesDocument(await api.updateClosedMap(editingMap.id, teams));
      toast.success(`Map ${editingMap.mapNumber} updated`, 'Series totals were recalculated.');
      setEditingMap(null);
    } catch (error) {
      toast.error('Could not save the correction', describe(error));
    }
  };

  return (
    <div className="grid max-w-6xl gap-6">
      <EditMapDialog
        map={editingMap}
        values={editValues}
        teamName={teamName}
        onChange={patchEdit}
        onCancel={() => setEditingMap(null)}
        onSave={() => void saveEdit()}
      />

      <ConfirmDialog
        open={pendingCloseMap}
        title="Close the current map?"
        confirmLabel="Close it"
        onCancel={() => setPendingCloseMap(false)}
        onConfirm={() => void closeMapNow()}
      >
        <p>
          Every currently alive team gets its final placement for this map now, ranked by
          eliminations — the same as if the match had actually ended. This becomes a permanent entry
          in the series history below, though it can still be corrected or deleted afterward.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingReset}
        title="Reset the series?"
        confirmLabel="Reset it"
        destructive
        onCancel={() => setPendingReset(false)}
        onConfirm={() => void resetSeries()}
      >
        <p>
          Every finished map recorded so far is removed for good, and the standings below start over
          from zero.
        </p>
        <p className="text-foreground font-medium">
          The map currently being played, if any, is <strong>not</strong> affected — its progress
          keeps counting and becomes map 1 of the new series once it closes.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete map ${pendingDelete?.mapNumber ?? ''}?`}
        confirmLabel="Delete it"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && void deleteMap(pendingDelete)}
      >
        <p>
          Removed for good. The remaining maps are renumbered, and every team&rsquo;s series total
          is recalculated without it.
        </p>
      </ConfirmDialog>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="border-border rounded border px-3 py-1.5 text-sm"
          onClick={() => setPendingCloseMap(true)}
        >
          Close current map now
        </button>
        <button
          type="button"
          className="bg-destructive rounded px-3 py-1.5 text-sm font-medium text-white"
          onClick={() => setPendingReset(true)}
        >
          Reset series
        </button>
      </div>

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Current standings</h3>
        <div className="grid gap-1">
          <div className="text-muted-foreground grid grid-cols-[2rem_1fr_5rem_5rem] gap-2 px-2 text-xs">
            <span>#</span>
            <span>Team</span>
            <span>PTS</span>
            <span>ELIMS</span>
          </div>
          {currentStandings.map((team) => (
            <div
              key={team.teamNo}
              className="border-border grid grid-cols-[2rem_1fr_5rem_5rem] items-center gap-2 rounded border px-2 py-1.5 text-sm"
              style={{ opacity: !team.hasAppeared ? 0.25 : team.isEliminated ? 0.45 : 1 }}
            >
              <span className="tabular-nums">{team.rank}</span>
              <span className="truncate">{team.name}</span>
              <span className="tabular-nums font-semibold">{team.totalPoints}</span>
              <span className="tabular-nums">{team.eliminations}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-2">
        <h3 className="text-sm font-medium">Finished maps</h3>
        {seriesDocument && seriesDocument.closedMaps.length === 0 && (
          <p className="text-muted-foreground text-sm">No map has finished yet this series.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {seriesDocument?.closedMaps.map((map) => (
            <div key={map.id} className="border-border grid content-start gap-2 rounded border p-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">
                  Map {map.mapNumber}
                  {map.mapName ? ` — ${map.mapName}` : ''}
                </span>
                <span className="text-muted-foreground text-xs">
                  {map.startedAt ? new Date(map.startedAt).toLocaleString() : 'start unknown'} →{' '}
                  {new Date(map.endedAt).toLocaleString()}
                  {map.startedAt ? ` (${formatDuration(map.endedAt - map.startedAt)})` : ''}
                </span>
              </div>

              <div className="grid gap-1">
                {[...map.teams]
                  .sort((a, b) => a.placement - b.placement)
                  .map((team) => (
                    <div
                      key={team.teamNo}
                      className="grid grid-cols-[2rem_1fr_3rem_3rem] items-center gap-2 text-sm"
                    >
                      <span className="tabular-nums">{team.placement}</span>
                      <span className="truncate">{teamName(team.teamNo)}</span>
                      <span className="text-right tabular-nums font-semibold">
                        {team.totalPoints}
                      </span>
                      <span className="text-right tabular-nums">{team.eliminations}</span>
                    </div>
                  ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className="border-border rounded border px-3 py-1.5 text-xs"
                  onClick={() => startEditing(map)}
                >
                  Correct this map
                </button>
                <button
                  type="button"
                  className="text-destructive rounded px-3 py-1.5 text-xs"
                  onClick={() => setPendingDelete(map)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
