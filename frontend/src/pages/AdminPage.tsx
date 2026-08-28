import type {
  CustomFont,
  OverlayInstance,
  OverlayInstancesDocument,
  ScoringRuleset,
  TeamRosterDocument,
} from '@cdf/shared';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Toaster } from '@/components/Toaster';
import { AppearanceEditor } from '@/features/admin/AppearanceEditor';
import { FontManager } from '@/features/admin/FontManager';
import { ImportIniButton } from '@/features/admin/ImportIniButton';
import { InstanceToolbar } from '@/features/admin/InstanceToolbar';
import { CopyableUrl } from '@/features/admin/CopyableUrl';
import { OnAirBadge } from '@/features/admin/OnAirBadge';
import { OverlayPreview } from '@/features/admin/OverlayPreview';
import { ScoringEditor } from '@/features/admin/ScoringEditor';
import { TeamRosterEditor } from '@/features/admin/TeamRosterEditor';
import { api, ApiError } from '@/lib/api';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useElementHeight } from '@/hooks/useElementSize';
import { applyCustomFontFaces } from '@/lib/font-faces';
import { isDeepEqual } from '@/lib/deep-equal';
import { toInstanceId } from '@/lib/instance-id';
import { useLiveStore } from '@/stores/live-store';
import { toast } from '@/stores/toast-store';

type Tab = 'overlays' | 'teams' | 'scoring' | 'fonts';

const SIDEBAR_STORAGE_KEY = 'cdf.admin.sidebar';

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
  useDocumentTitle('Admin - PUBG overlays');

  const snapshot = useLiveStore((state) => state.snapshot);
  const overlayStates = useLiveStore((state) => state.overlayStates);
  const connect = useLiveStore((state) => state.connect);

  const [tab, setTab] = useState<Tab>('overlays');
  const [overlays, setOverlays] = useState<OverlayInstancesDocument | null>(null);
  /**
   * What the server last confirmed, kept beside the draft so an edit that is undone stops counting
   * as a change. Comparing against the live channel instead would tie the Save button to the socket
   * being connected.
   */
  const [savedOverlays, setSavedOverlays] = useState<OverlayInstance[]>([]);
  const [teams, setTeams] = useState<TeamRosterDocument | null>(null);
  const [scoring, setScoring] = useState<ScoringRuleset | null>(null);
  const [fonts, setFonts] = useState<CustomFont[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  /** The instance the operator has asked to delete, pending confirmation. */
  const [pendingDelete, setPendingDelete] = useState<OverlayInstance | null>(null);
  /**
   * Remembered across reloads: whether the preview or the instance list matters more is a working
   * preference, and an operator who collapsed it once should not have to do it again every session.
   */
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'collapsed',
  );

  /*
   * The sticky header and nav overlap anything else that sticks, so the control column has to sit
   * below them. Measured rather than hard-coded: the header wraps on a narrow window, and a fixed
   * offset would leave a gap on wide screens and a clipped panel on narrow ones.
   */
  const chromeRef = useRef<HTMLDivElement>(null);
  const chromeHeight = useElementHeight(chromeRef);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarOpen ? 'open' : 'collapsed');
  }, [sidebarOpen]);

  // The admin joins the live channel as an observer, with no instance id. It gets match data for
  // the preview plus the visibility of every overlay, so it can show what is genuinely on air —
  // including a change a director just made from a stream deck.
  useEffect(() => connect(), [connect]);

  const reloadOverlays = useCallback(async (): Promise<OverlayInstancesDocument | null> => {
    try {
      const document = await api.getOverlays();
      setOverlays(document);
      setSavedOverlays(document.instances);
      return document;
    } catch (error) {
      toast.error('Could not load the overlays', describe(error));
      return null;
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [overlayDocument, teamDocument, ruleset, fontDocument] = await Promise.all([
          api.getOverlays(),
          api.getTeams(),
          api.getScoring(),
          api.getFonts(),
        ]);
        setOverlays(overlayDocument);
        setSavedOverlays(overlayDocument.instances);
        setTeams(teamDocument);
        setScoring(ruleset);
        setFonts(fontDocument.fonts);
        // Registered here as well as on the live channel, so the previews and the sample text are
        // correct before any overlay message has arrived.
        applyCustomFontFaces(fontDocument.fonts);
        setSelectedId(overlayDocument.instances[0]?.id ?? null);
      } catch (error) {
        toast.error(
          'Could not load the configuration',
          `${describe(error)} Is the backend running?`,
        );
      }
    })();
  }, []);

  const selected = overlays?.instances.find((instance) => instance.id === selectedId) ?? null;
  const selectedVisible = selected ? overlayStates[selected.id]?.visible : undefined;
  const newInstanceId = toInstanceId(newName);

  const savedSelected = savedOverlays.find((instance) => instance.id === selectedId) ?? null;
  const isDirty = selected !== null && !isDeepEqual(selected, savedSelected);

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
      setSavedOverlays((previous) =>
        previous.map((entry) => (entry.id === instance.id ? instance : entry)),
      );
      toast.success(
        `Saved “${instance.name}”`,
        'Every open browser source has already picked up the new look.',
      );
    } catch (error) {
      toast.error(`Could not save “${instance.name}”`, describe(error));
    }
  };

  const createOverlay = async (id: string, name: string, copyFrom?: string) => {
    try {
      await api.createOverlay({ id, name, ...(copyFrom ? { copyAppearanceFrom: copyFrom } : {}) });
      await reloadOverlays();
      setSelectedId(id);
      setNewName('');
      toast.success(
        copyFrom ? `Duplicated as “${name}”` : `Created “${name}”`,
        `Its browser source address is /overlay/${id}`,
      );
    } catch (error) {
      toast.error(`Could not create “${name}”`, describe(error));
    }
  };

  const toggleVisibility = async (instance: OverlayInstance) => {
    try {
      const state = await api.setOverlayVisibility(instance.id, 'toggle');
      // Confirm what actually happened using the state the server returned, not what we assumed —
      // the two can differ if a director pressed a button at the same moment.
      toast.success(
        state.visible ? `“${instance.name}” is ON AIR` : `“${instance.name}” is hidden`,
        state.visible
          ? 'It animated on in every browser source showing this overlay.'
          : 'It animated off in every browser source showing this overlay.',
      );
    } catch (error) {
      toast.error(`Could not change “${instance.name}”`, describe(error));
    }
  };

  const deleteOverlay = async (instance: OverlayInstance) => {
    setPendingDelete(null);
    try {
      await api.deleteOverlay(instance.id);
      const refreshed = await reloadOverlays();
      setSelectedId(refreshed?.instances[0]?.id ?? null);
      toast.success(
        `Deleted “${instance.name}”`,
        `Any browser source still pointing at /overlay/${instance.id} will now show nothing.`,
      );
    } catch (error) {
      toast.error(`Could not delete “${instance.name}”`, describe(error));
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

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete “${pendingDelete?.name ?? ''}”?`}
        confirmLabel="Delete it"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && void deleteOverlay(pendingDelete)}
      >
        <p>
          Its settings are removed for good. Any browser source pointing at{' '}
          <code className="font-mono text-xs">/overlay/{pendingDelete?.id}</code> will show nothing
          afterwards, and Stream Deck buttons for it will stop working.
        </p>
        {pendingDelete && overlayStates[pendingDelete.id]?.visible && (
          // Worth saying plainly: this one is not merely configured, it is on screen right now.
          <p className="text-destructive font-medium">
            This overlay is on air at the moment. Deleting it will take it off.
          </p>
        )}
      </ConfirmDialog>

      {/*
       * The gold rule under the header echoes the accent strip on the overlay itself, so the tool
       * and what it puts on screen read as the same product.
       */}
      {/*
       * Header and tabs travel together and stay put: the connection indicator is the thing an
       * operator glances at mid-broadcast, and it is no use only at the top of a long form.
       */}
      <div ref={chromeRef} className="bg-background sticky top-0 z-30">
        <header className="flex flex-wrap items-center gap-4 border-b border-b-[var(--brand-gold)]/70 bg-[var(--brand-navy)] px-6 py-3">
          <img
            src="/images/app-logo-128.png"
            alt=""
            width={44}
            height={44}
            className="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"
          />
          <div className="mr-auto">
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="text-[var(--brand-gold)]">Chicken</span> Dinner Feed
            </h1>
            <p className="text-muted-foreground text-xs tracking-wide uppercase">Overlay control</p>
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
              ['fonts', 'Fonts'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`border-b-2 px-3 py-2 text-sm transition-colors ${
                tab === value
                  ? 'border-[var(--brand-gold)] text-[var(--brand-gold)]'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <main className="p-6">
        {tab === 'overlays' && overlays && (
          <div
            className="grid gap-6"
            style={{
              // Explicit lengths rather than `auto`, because `auto` cannot be interpolated — this is
              // what makes the collapse animate instead of snap.
              gridTemplateColumns: sidebarOpen
                ? '17rem minmax(0, 1fr) minmax(0, 1fr)'
                : '2.75rem minmax(0, 1fr) minmax(0, 1.6fr)',
              transition: 'grid-template-columns 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <aside className="border-border relative border-r pr-5">
              {/*
               * The toggle sits outside the clipped container on purpose. Clipping the content is
               * what lets it slide away cleanly, but `overflow: hidden` on an ancestor kills
               * `position: sticky` — so the sticky control has to be a sibling of the clip, not a
               * child of it.
               */}
              <div className="bg-background sticky top-4 z-10 flex items-center gap-2 pb-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="hover:bg-secondary text-muted-foreground grid size-8 shrink-0 place-items-center rounded transition-colors"
                  aria-label={sidebarOpen ? 'Collapse the instance list' : 'Show the instance list'}
                  aria-expanded={sidebarOpen}
                  title={
                    sidebarOpen
                      ? 'Collapse the list to make the preview bigger'
                      : 'Show the instance list'
                  }
                >
                  {sidebarOpen ? (
                    <PanelLeftClose className="size-4" aria-hidden />
                  ) : (
                    <PanelLeftOpen className="size-4" aria-hidden />
                  )}
                </button>
                <h2
                  className="text-sm font-medium whitespace-nowrap transition-opacity duration-200"
                  style={{ opacity: sidebarOpen ? 1 : 0 }}
                  aria-hidden={!sidebarOpen}
                >
                  Instances
                </h2>
              </div>

              {/*
               * Kept mounted and clipped rather than unmounted, so it slides rather than pops. Its
               * inner width is fixed at the open width, so the contents do not reflow while the
               * column is mid-animation.
               *
               * `inert` while collapsed: invisible controls must not be reachable by keyboard.
               */}
              <div className="overflow-hidden">
                <div
                  className="grid w-[15.25rem] content-start gap-3 transition-opacity duration-200"
                  style={{ opacity: sidebarOpen ? 1 : 0 }}
                  inert={!sidebarOpen}
                >
                  <>
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

                    {/*
                     * The operator names the overlay; the id is derived. Asking for a URL-safe id and
                     * rejecting "Szép tabella 2" is the wrong question — they are naming a thing, not
                     * writing a URL. The derived address is shown so nothing is hidden from them.
                     */}
                    <div className="grid gap-2">
                      <label className="grid gap-1 text-xs">
                        <span className="text-muted-foreground">New overlay name</span>
                        <input
                          type="text"
                          placeholder="Second leaderboard"
                          className="border-border bg-background rounded border px-2 py-1.5 text-sm"
                          value={newName}
                          onChange={(event) => setNewName(event.target.value)}
                        />
                      </label>

                      {newName.trim() && (
                        <p className="text-muted-foreground text-xs">
                          Address:{' '}
                          {newInstanceId ? (
                            <code className="font-mono">/overlay/{newInstanceId}</code>
                          ) : (
                            <span className="text-destructive">
                              that name has no letters or digits to build an address from
                            </span>
                          )}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="border-border rounded border px-3 py-1.5 text-xs disabled:opacity-40"
                          disabled={!newInstanceId}
                          onClick={() => void createOverlay(newInstanceId, newName.trim())}
                          title="Create an overlay with the default appearance"
                        >
                          Create
                        </button>
                        <button
                          type="button"
                          className="border-border rounded border px-3 py-1.5 text-xs disabled:opacity-40"
                          disabled={!newInstanceId || !selected}
                          onClick={() =>
                            selected &&
                            void createOverlay(newInstanceId, newName.trim(), selected.id)
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
                        copies the look of{' '}
                        {selected ? `“${selected.name}”` : 'the selected overlay'}.
                      </p>
                    </div>
                  </>
                </div>
              </div>
            </aside>

            {selected ? (
              <>
                <section className="grid content-start gap-5">
                  <AppearanceEditor
                    appearance={selected.appearance}
                    customFonts={fonts}
                    onChange={(appearance) => patchSelected({ appearance })}
                  />
                </section>

                {/*
                 * Toolbar, preview and address travel together and stick below the chrome, so an
                 * animation adjusted at the bottom of the form can still be watched and saved
                 * without scrolling back up. It scrolls internally on a short window rather than
                 * being cut off.
                 */}
                <aside
                  className="grid content-start gap-3 self-start overflow-y-auto lg:sticky"
                  style={{
                    top: `calc(${chromeHeight}px + 1rem)`,
                    maxHeight: `calc(100dvh - ${chromeHeight}px - 2rem)`,
                  }}
                >
                  <InstanceToolbar
                    instance={selected}
                    visible={selectedVisible}
                    isDirty={isDirty}
                    onRename={(name) => patchSelected({ name })}
                    onSave={() => void saveInstance(selected)}
                    onToggleVisibility={() => void toggleVisibility(selected)}
                    onDelete={() => setPendingDelete(selected)}
                  />

                  <OverlayPreview instanceId={selected.id} />

                  <p className="text-muted-foreground text-xs">
                    This is the overlay itself, loaded from the same address your browser source
                    uses — including its show/hide animation. It shows <strong>saved</strong>{' '}
                    settings, because that is what is on air: press Save to see a change here.
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
            <ImportIniButton onImported={setTeams} />
            <TeamRosterEditor document={teams} onChange={setTeams} />
            <button
              type="button"
              className="bg-primary text-primary-foreground w-fit rounded px-3 py-1.5 text-sm"
              onClick={async () => {
                try {
                  setTeams(await api.saveTeams(teams));
                  toast.success('Teams saved', 'The names on air have already changed.');
                } catch (error) {
                  toast.error('Could not save the teams', describe(error));
                }
              }}
            >
              Save teams
            </button>
          </div>
        )}

        {tab === 'fonts' && (
          <div className="grid max-w-2xl gap-4">
            <FontManager fonts={fonts} onChange={setFonts} />
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
                  toast.success(
                    'Scoring saved',
                    'The standings were recalculated immediately, mid-match included.',
                  );
                } catch (error) {
                  toast.error('Could not save the scoring', describe(error));
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
