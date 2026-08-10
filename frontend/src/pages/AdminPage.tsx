import type {
  OverlayInstance,
  OverlayInstancesDocument,
  ScoringRuleset,
  TeamRosterDocument,
} from '@cdf/shared';
import { useCallback, useEffect, useState } from 'react';
import { AppearanceEditor } from '@/features/admin/AppearanceEditor';
import { OverlayPreview } from '@/features/admin/OverlayPreview';
import { ScoringEditor } from '@/features/admin/ScoringEditor';
import { TeamRosterEditor } from '@/features/admin/TeamRosterEditor';
import { api, ApiError } from '@/lib/api';
import { useLiveStore } from '@/stores/live-store';

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

export function AdminPage() {
  const snapshot = useLiveStore((state) => state.snapshot);
  const connect = useLiveStore((state) => state.connect);

  const [tab, setTab] = useState<Tab>('overlays');
  const [overlays, setOverlays] = useState<OverlayInstancesDocument | null>(null);
  const [teams, setTeams] = useState<TeamRosterDocument | null>(null);
  const [scoring, setScoring] = useState<ScoringRuleset | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);
  const [newId, setNewId] = useState('');

  // The admin joins the live channel with no instance id: it wants match data for the preview, but
  // it is not an overlay and must not receive another instance's visibility.
  useEffect(() => connect(), [connect]);

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
        setStatus({ tone: 'error', message: describe(error) });
      }
    })();
  }, []);

  const selected = overlays?.instances.find((instance) => instance.id === selectedId) ?? null;

  const saveInstance = useCallback(async (instance: OverlayInstance) => {
    try {
      await api.updateOverlay(instance);
      setStatus({ tone: 'ok', message: `Saved “${instance.name}”.` });
    } catch (error) {
      setStatus({ tone: 'error', message: describe(error) });
    }
  }, []);

  const ingest = snapshot?.ingest;
  const connection = ingest
    ? (CONNECTION_LABEL[ingest.state] ?? CONNECTION_LABEL.disconnected!)
    : null;

  return (
    <div className="min-h-dvh">
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

      {status && (
        <div
          role="status"
          className={`px-6 py-2 text-sm ${status.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {status.message}
        </div>
      )}

      <main className="p-6">
        {tab === 'overlays' && overlays && (
          <div className="grid gap-8 lg:grid-cols-[16rem_1fr_auto]">
            <aside className="grid content-start gap-3">
              <h2 className="text-sm font-medium">Instances</h2>
              <ul className="grid gap-1">
                {overlays.instances.map((instance) => (
                  <li key={instance.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(instance.id)}
                      className={`w-full rounded px-3 py-2 text-left text-sm ${
                        instance.id === selectedId ? 'bg-secondary' : 'hover:bg-secondary/60'
                      }`}
                    >
                      <span className="block">{instance.name}</span>
                      <span className="text-muted-foreground block font-mono text-xs">
                        /overlay/{instance.id}
                      </span>
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
                <button
                  type="button"
                  className="border-border rounded border px-3 py-1.5 text-xs disabled:opacity-40"
                  disabled={!newId.trim()}
                  onClick={async () => {
                    try {
                      await api.createOverlay({
                        id: newId.trim(),
                        name: newId.trim(),
                        ...(selectedId ? { copyAppearanceFrom: selectedId } : {}),
                      });
                      const refreshed = await api.getOverlays();
                      setOverlays(refreshed);
                      setSelectedId(newId.trim());
                      setNewId('');
                      setStatus({ tone: 'ok', message: 'Overlay created.' });
                    } catch (error) {
                      setStatus({ tone: 'error', message: describe(error) });
                    }
                  }}
                >
                  Add an overlay
                </button>
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
                      onChange={(event) =>
                        setOverlays({
                          ...overlays,
                          instances: overlays.instances.map((instance) =>
                            instance.id === selected.id
                              ? { ...instance, name: event.target.value }
                              : instance,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm"
                      onClick={() => void saveInstance(selected)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="border-border rounded border px-3 py-1.5 text-sm"
                      onClick={async () => {
                        try {
                          await api.setOverlayVisibility(selected.id, 'toggle');
                        } catch (error) {
                          setStatus({ tone: 'error', message: describe(error) });
                        }
                      }}
                    >
                      Show / hide on air
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive ml-auto text-xs"
                      onClick={async () => {
                        try {
                          await api.deleteOverlay(selected.id);
                          const refreshed = await api.getOverlays();
                          setOverlays(refreshed);
                          setSelectedId(refreshed.instances[0]?.id ?? null);
                        } catch (error) {
                          setStatus({ tone: 'error', message: describe(error) });
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <AppearanceEditor
                    appearance={selected.appearance}
                    onChange={(appearance) =>
                      setOverlays({
                        ...overlays,
                        instances: overlays.instances.map((instance) =>
                          instance.id === selected.id ? { ...instance, appearance } : instance,
                        ),
                      })
                    }
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
                  <code className="bg-muted rounded px-2 py-1 text-xs">
                    {window.location.origin}/overlay/{selected.id}
                  </code>
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
                  setStatus({ tone: 'ok', message: 'Teams saved.' });
                } catch (error) {
                  setStatus({ tone: 'error', message: describe(error) });
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
                  setStatus({
                    tone: 'ok',
                    message: 'Scoring saved — standings update immediately.',
                  });
                } catch (error) {
                  setStatus({ tone: 'error', message: describe(error) });
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

function describe(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
