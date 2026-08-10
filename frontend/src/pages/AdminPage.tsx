import type {
  OverlayInstance,
  OverlayInstancesDocument,
  ScoringRuleset,
  TeamRosterDocument,
} from '@cdf/shared';
import { useCallback, useEffect, useState } from 'react';
import { Toaster } from '@/components/Toaster';
import { AppearanceEditor } from '@/features/admin/AppearanceEditor';
import { CopyableUrl } from '@/features/admin/CopyableUrl';
import { OnAirBadge } from '@/features/admin/OnAirBadge';
import { OverlayPreview } from '@/features/admin/OverlayPreview';
import { ScoringEditor } from '@/features/admin/ScoringEditor';
import { TeamRosterEditor } from '@/features/admin/TeamRosterEditor';
import { api, ApiError } from '@/lib/api';
import { useLiveStore } from '@/stores/live-store';
import { toast } from '@/stores/toast-store';

type Tab = 'overlays' | 'teams' | 'scoring';

const CONNECTION_LABEL: Record<string, { label: string; hint: string; tone: string }> = {
  connected: { label: 'Connected', hint: 'Match data is arriving', tone: 'bg-emerald-500' },
  stale: {
    label: 'Stale',
    hint: 'Connected, but nothing new recently — check the room host',
    tone: 'bg-amber-500',
  },
  connecting: { label: 'Connecting', hint: 'Trying to reach the data source', tone: 'bg-sky-500' },
  disconnected: {
    label: 'Disconnected',
    hint: 'Check that launch.bat is running and "API Enable" is ticked',
    tone: 'bg-zinc-500',
  },
};

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}

export function AdminPage() {
  const snapshot = useLiveStore((state) => state.snapshot);
  const overlayStates = useLiveStore((state) => state.overlayStates);
  const connect = useLiveStore((state) => state.connect);

  const [tab, setTab] = useState<Tab>('overlays');
  const [overlays, setOverlays] = useState<OverlayInstancesDocument | null>(null);
  const [teams, setTeams] = useState<TeamRosterDocument | null>(null);
  const [scoring, setScoring] = useState<ScoringRuleset | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newId, setNewId] = useState('');

  // The admin joins the live channel as an observer, with no instance id. It gets match data for
  // the preview plus the visibility of every overlay, so it can show what is genuinely on air —
  // including a change a director just made from a stream deck.
  useEffect(() => connect(), [connect]);

  const reloadOverlays = useCallback(async (): Promise<OverlayInstancesDocument | null> => {
    try {
      const document = await api.getOverlays();
      setOverlays(document);
      return document;
    } catch (error) {
      toast.error(describe(error));
      return null;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [overlayDocument, teamDocument, ruleset] = await Promise.all([
          api.getOverlays(),
          api.getTeams(),
          api.getScoring(),
        ]);
        setOverlays(overlayDocument);
        setTeams(teamDocument);
        setScoring(ruleset);
        setSelectedId(overlayDocument.instances[0]?.id ?? null);
      } catch (error) {
        toast.error(describe(error));
      }
    })();
  }, []);

  const selected = overlays?.instances.find((instance) => instance.id === selectedId) ?? null;
  const selectedVisible = selected ? overlayStates[selected.id]?.visible : undefined;

  const patchSelected = (changes: Partial<OverlayInstance>) => {
    if (!overlays || !selected) return;
    setOverlays({
      ...overlays,
      instances: overlays.instances.map((instance) =>
        instance.id === selected.id ? { ...instance, ...changes } : instance,
      ),
    });
  };

  const saveInstance = async (instance: OverlayInstance) => {
    try {
      await api.updateOverlay(instance);
      toast.success(`Saved “${instance.name}” — it is live on air now.`);
    } catch (error) {
      toast.error(describe(error));
    }
  };

  const createOverlay = async (id: string, name: string, copyFrom?: string) => {
    try {
      await api.createOverlay({ id, name, ...(copyFrom ? { copyAppearanceFrom: copyFrom } : {}) });
      await reloadOverlays();
      setSelectedId(id);
      setNewId('');
      toast.success(copyFrom ? `Duplicated as “${name}”.` : `Created “${name}”.`);
    } catch (error) {
      toast.error(describe(error));
    }
  };

  const toggleVisibility = async (instance: OverlayInstance) => {
    try {
      const state = await api.setOverlayVisibility(instance.id, 'toggle');
      // Confirm what actually happened using the state the server returned, not what we assumed —
      // the two can differ if a director pressed a button at the same moment.
      toast.success(
        state.visible ? `“${instance.name}” is now ON AIR.` : `“${instance.name}” is now hidden.`,
      );
    } catch (error) {
      toast.error(describe(error));
    }
  };

  const ingest = snapshot?.ingest;
  const connection = ingest
    ? (CONNECTION_LABEL[ingest.state] ?? CONNECTION_LABEL.disconnected!)
    : null;

  return (
    <div className="min-h-dvh">
      {/*
       * Mounted here rather than at the router root on purpose: the overlay routes render onto a
       * broadcast surface, and a toast appearing there would go out on air.
       */}
      <Toaster />

      <header className="border-border flex flex-wrap items-center gap-4 border-b px-6 py-4">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold tracking-tight">chicken-dinner-feed</h1>
          <p className="text-muted-foreground text-xs">Overlay control</p>
        </div>

        {connection && (
          <div className="flex items-center gap-2" title={connection.hint}>
            <span className={`size-2 rounded-full ${connection.tone}`} />
            <span className="text-sm">{connection.label}</span>
            <span className="text-muted-foreground hidden text-xs sm:inline">
              — {connection.hint}
            </span>
          </div>
        )}
      </header>

      <nav className="border-border flex gap-1 border-b px-6">
        {(
          [
            ['overlays', 'Overlays'],
            ['teams', 'Teams'],
            ['scoring', 'Scoring'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`border-b-2 px-3 py-2 text-sm ${
              tab === value ? 'border-foreground' : 'text-muted-foreground border-transparent'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="p-6">
        {tab === 'overlays' && overlays && (
          <div className="grid gap-8 lg:grid-cols-[17rem_1fr_auto]">
            <aside className="grid content-start gap-3">
              <h2 className="text-sm font-medium">Instances</h2>
              <ul className="grid gap-1">
                {overlays.instances.map((instance) => (
                  <li key={instance.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(instance.id)}
                      className={`flex w-full items-start gap-2 rounded px-3 py-2 text-left text-sm ${
                        instance.id === selectedId ? 'bg-secondary' : 'hover:bg-secondary/60'
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{instance.name}</span>
                        <span className="text-muted-foreground block truncate font-mono text-xs">
                          /overlay/{instance.id}
                        </span>
                      </span>
                      <OnAirBadge visible={overlayStates[instance.id]?.visible} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="grid gap-2">
                <input
                  type="text"
                  placeholder="new-overlay-id"
                  aria-label="New overlay id"
                  className="border-border bg-background rounded border px-2 py-1.5 font-mono text-xs"
                  value={newId}
                  onChange={(event) => setNewId(event.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="border-border rounded border px-3 py-1.5 text-xs disabled:opacity-40"
                    disabled={!newId.trim()}
                    onClick={() => void createOverlay(newId.trim(), newId.trim())}
                    title="Create an overlay with the default appearance"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    className="border-border rounded border px-3 py-1.5 text-xs disabled:opacity-40"
                    disabled={!newId.trim() || !selected}
                    onClick={() =>
                      selected &&
                      void createOverlay(newId.trim(), `${selected.name} copy`, selected.id)
                    }
                    title={
                      selected
                        ? `Create it with the appearance of “${selected.name}”`
                        : 'Select an overlay to copy first'
                    }
                  >
                    Duplicate
                  </button>
                </div>
                <p className="text-muted-foreground text-xs">
                  <strong>Create</strong> starts from the defaults. <strong>Duplicate</strong>{' '}
                  copies the look of {selected ? `“${selected.name}”` : 'the selected overlay'}.
                </p>
              </div>
            </aside>

            {selected ? (
              <>
                <section className="grid content-start gap-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      aria-label="Overlay name"
                      className="border-border bg-background rounded border px-2 py-1.5 text-sm"
                      value={selected.name}
                      onChange={(event) => patchSelected({ name: event.target.value })}
                    />
                    <button
                      type="button"
                      className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm"
                      onClick={() => void saveInstance(selected)}
                    >
                      Save
                    </button>

                    <div className="border-border flex items-center gap-2 rounded border px-2 py-1">
                      <OnAirBadge visible={selectedVisible} />
                      <button
                        type="button"
                        className="hover:bg-secondary rounded px-2 py-1 text-sm"
                        onClick={() => void toggleVisibility(selected)}
                      >
                        {selectedVisible === true
                          ? 'Hide it'
                          : selectedVisible === false
                            ? 'Show it'
                            : 'Show / hide'}
                      </button>
                    </div>

                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive ml-auto text-xs"
                      onClick={async () => {
                        try {
                          await api.deleteOverlay(selected.id);
                          const refreshed = await reloadOverlays();
                          setSelectedId(refreshed?.instances[0]?.id ?? null);
                          toast.success(`Deleted “${selected.name}”.`);
                        } catch (error) {
                          toast.error(describe(error));
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <AppearanceEditor
                    appearance={selected.appearance}
                    onChange={(appearance) => patchSelected({ appearance })}
                  />
                </section>

                <aside className="grid content-start gap-3">
                  <h2 className="text-sm font-medium">Preview</h2>
                  <OverlayPreview
                    match={snapshot?.match ?? null}
                    appearance={selected.appearance}
                  />
                  <p className="text-muted-foreground max-w-[35rem] text-xs">
                    This is the real overlay, driven by live match data. Changes appear here
                    immediately, but only reach your broadcast when you press Save.
                  </p>
                  <CopyableUrl
                    label="Browser source address"
                    url={`${window.location.origin}/overlay/${selected.id}`}
                  />
                </aside>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                No overlays yet. Create one to get started.
              </p>
            )}
          </div>
        )}

        {tab === 'teams' && teams && (
          <div className="grid max-w-3xl gap-4">
            <TeamRosterEditor document={teams} onChange={setTeams} />
            <button
              type="button"
              className="bg-primary text-primary-foreground w-fit rounded px-3 py-1.5 text-sm"
              onClick={async () => {
                try {
                  setTeams(await api.saveTeams(teams));
                  toast.success('Teams saved.');
                } catch (error) {
                  toast.error(describe(error));
                }
              }}
            >
              Save teams
            </button>
          </div>
        )}

        {tab === 'scoring' && scoring && (
          <div className="grid max-w-3xl gap-4">
            <ScoringEditor ruleset={scoring} onChange={setScoring} />
            <button
              type="button"
              className="bg-primary text-primary-foreground w-fit rounded px-3 py-1.5 text-sm"
              onClick={async () => {
                try {
                  setScoring(await api.saveScoring(scoring));
                  toast.success('Scoring saved — the standings have already updated.');
                } catch (error) {
                  toast.error(describe(error));
                }
              }}
            >
              Save scoring
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
