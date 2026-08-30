import { useEffect, useState } from 'react';
import type { ClosedMapResult, SeriesDocument, Team } from '@cdf/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { api, ApiError } from '@/lib/api';
import { useLiveStore } from '@/stores/live-store';
import { toast } from '@/stores/toast-store';
import { MapResultDialog, type MapTeamResultValue } from './MapResultDialog';

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

/**
 * When a map ran, as far as anything is known about it. A map added by hand has no clock at all; one
 * recorded across a backend restart has an end but no start.
 */
function formatWhen(map: ClosedMapResult): string {
  if (map.endedAt === null) return 'Added by hand — not played through the app';

  const ended = new Date(map.endedAt).toLocaleString();
  if (map.startedAt === null) return `start unknown → ${ended}`;
  return `${new Date(map.startedAt).toLocaleString()} → ${ended} (${formatDuration(map.endedAt - map.startedAt)})`;
}

/**
 * Which map form is open. One at a time, sharing a single set of values: correcting a recorded map
 * and adding one by hand collect exactly the same per-team inputs.
 */
type MapForm = { mode: 'edit'; map: ClosedMapResult } | { mode: 'add'; position: number } | null;

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
  const [form, setForm] = useState<MapForm>(null);
  const [formValues, setFormValues] = useState<Record<number, MapTeamResultValue>>({});

  const currentStandings = liveTeams ?? fallbackStandings;
  const closedMaps = seriesDocument?.closedMaps ?? [];

  // Team-number order, not the live ranking: adding a map by hand means transcribing a results
  // sheet, and a list that reorders itself as the running match changes is the wrong thing to read
  // down. The edit form keeps the map's own recorded order for the same reason.
  const rosterTeamNos = [...currentStandings].map((team) => team.teamNo).sort((a, b) => a - b);

  const formTeamNos =
    form?.mode === 'edit' ? form.map.teams.map((team) => team.teamNo) : rosterTeamNos;

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
    setForm({ mode: 'edit', map });
    setFormValues(
      Object.fromEntries(
        map.teams.map((team) => [
          team.teamNo,
          { placement: team.placement, eliminations: team.eliminations },
        ]),
      ),
    );
  };

  const startAdding = () => {
    setForm({ mode: 'add', position: closedMaps.length + 1 });
    // Seeded with distinct placements in team order so an untouched form is already valid — the
    // server rejects two teams sharing a placement, and a blank form that cannot be saved without
    // first fixing every row would be a poor starting point for transcribing a results sheet.
    setFormValues(
      Object.fromEntries(
        rosterTeamNos.map((teamNo, index) => [teamNo, { placement: index + 1, eliminations: 0 }]),
      ),
    );
  };

  const patchValue = (teamNo: number, changes: Partial<MapTeamResultValue>) => {
    setFormValues((previous) => ({
      ...previous,
      [teamNo]: {
        placement: previous[teamNo]?.placement ?? 1,
        eliminations: previous[teamNo]?.eliminations ?? 0,
        ...changes,
      },
    }));
  };

  const submitForm = async () => {
    if (!form) return;

    const teams = formTeamNos.map((teamNo) => ({
      teamNo,
      placement: formValues[teamNo]?.placement ?? 1,
      eliminations: formValues[teamNo]?.eliminations ?? 0,
    }));

    try {
      if (form.mode === 'edit') {
        setSeriesDocument(await api.updateClosedMap(form.map.id, teams));
        toast.success(`Map ${form.map.mapNumber} updated`, 'Series totals were recalculated.');
      } else {
        setSeriesDocument(await api.addManualMap(form.position, teams));
        toast.success(
          `Map added at position ${form.position}`,
          'The maps after it were renumbered and every series total recalculated.',
        );
      }
      setForm(null);
    } catch (error) {
      toast.error(
        form.mode === 'edit' ? 'Could not save the correction' : 'Could not add the map',
        describe(error),
      );
    }
  };

  return (
    <div className="grid max-w-6xl gap-6">
      <MapResultDialog
        open={form !== null}
        title={form?.mode === 'edit' ? `Correct map ${form.map.mapNumber}` : 'Add a map by hand'}
        description={
          form?.mode === 'edit'
            ? 'Points are always recalculated from the scoring ruleset — enter the real placement and elimination count, not the points themselves.'
            : 'Records a map the app never saw played, exactly as if it had been. Points are calculated from the scoring ruleset, so enter placements and eliminations only.'
        }
        confirmLabel={form?.mode === 'edit' ? 'Save correction' : 'Add this map'}
        teamNos={formTeamNos}
        values={formValues}
        teamName={teamName}
        onChange={patchValue}
        onCancel={() => setForm(null)}
        onConfirm={() => void submitForm()}
      >
        {form?.mode === 'add' && (
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Position in the series</span>
            <select
              className="border-border bg-background w-fit rounded border px-2 py-1.5 text-sm"
              value={form.position}
              onChange={(event) => setForm({ mode: 'add', position: Number(event.target.value) })}
            >
              {Array.from({ length: closedMaps.length + 1 }, (_unused, index) => index + 1).map(
                (position) => (
                  <option key={position} value={position}>
                    {position === closedMaps.length + 1
                      ? `Last (map ${position})`
                      : `Map ${position} — pushes the current map ${position} and everything after it down`}
                  </option>
                ),
              )}
            </select>
          </label>
        )}
      </MapResultDialog>

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
          className="border-border rounded border px-3 py-1.5 text-sm"
          onClick={startAdding}
        >
          Add map by hand
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
        {seriesDocument && closedMaps.length === 0 && (
          <p className="text-muted-foreground text-sm">No map has finished yet this series.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {closedMaps.map((map) => (
            <div key={map.id} className="border-border grid content-start gap-2 rounded border p-3">
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">
                  Map {map.mapNumber}
                  {map.mapName ? ` — ${map.mapName}` : ''}
                </span>
                <span className="text-muted-foreground text-xs">{formatWhen(map)}</span>
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
