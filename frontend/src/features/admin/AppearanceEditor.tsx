import type {
  CustomFont,
  OverlayAnimation,
  OverlayAnimationDirection,
  OverlayAnimationType,
  OverlayAppearance,
  OverlayColors,
} from '@cdf/shared';
import { fontFamilyValue } from '@cdf/shared';
import { ColorField } from './ColorField';

/**
 * Each of the first three is one concrete weight, loaded live from Google Fonts (index.html) — not
 * a family with a range of weights still open, since only that one weight is ever fetched. Labelled
 * accordingly ("Inter Bold", not "Inter") so the picker does not promise a choice that is not there.
 *
 * "Arial" needs no network at all — a plain, universally-installed Windows font, offered for an
 * operator with no internet on site. Without it, or if Google Fonts genuinely cannot be reached,
 * each of the first three quietly falls back to the next entry in its own stack instead of failing.
 */
const FONT_OPTIONS = [
  { value: "'Inter', system-ui, sans-serif", label: 'Inter Bold' },
  { value: "'Rajdhani', system-ui, sans-serif", label: 'Rajdhani SemiBold' },
  { value: "'Barlow Condensed', system-ui, sans-serif", label: 'Barlow Condensed SemiBold' },
  { value: 'Arial, system-ui, sans-serif', label: 'Arial' },
  { value: "'Courier New', monospace", label: 'Monospace' },
];

export interface AppearanceEditorProps {
  appearance: OverlayAppearance;
  /** Uploaded fonts, offered alongside the built-in choices. */
  customFonts: CustomFont[];
  onChange(appearance: OverlayAppearance): void;
}

export function AppearanceEditor({ appearance, customFonts, onChange }: AppearanceEditorProps) {
  const patch = (changes: Partial<OverlayAppearance>) => onChange({ ...appearance, ...changes });
  const patchColor = (key: keyof OverlayColors, value: string) =>
    patch({ colors: { ...appearance.colors, [key]: value } });

  const animation = appearance.animation;
  const patchAnimation = (changes: Partial<OverlayAnimation>) =>
    patch({ animation: { ...animation, ...changes } });
  const patchRows = (changes: Partial<OverlayAnimation['rows']>) =>
    patchAnimation({ rows: { ...animation.rows, ...changes } });

  const hasDirection = animation.type === 'wipe' || animation.type === 'slide';
  const plainName = animation.type === 'zoom-fade' ? 'zoom' : animation.type;
  const fadeHint =
    animation.type === 'fade' ? '— already a fade' : `— off leaves a plain ${plainName}`;
  // How long the whole list takes to fill, which is what an operator is actually choosing.
  const rowSweepSeconds = ((appearance.maxTeams * animation.rows.staggerMs) / 1000).toFixed(1);

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h3 className="text-sm font-medium">Placement</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Side</span>
            <select
              className="border-border bg-background rounded border px-2 py-1.5 text-sm"
              value={appearance.anchor}
              onChange={(event) => patch({ anchor: event.target.value as 'left' | 'right' })}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Distance from that edge</span>
            <input
              type="number"
              min={0}
              max={1800}
              className="border-border bg-background rounded border px-2 py-1.5 text-sm"
              value={appearance.offsetX}
              onChange={(event) => patch({ offsetX: Number(event.target.value) })}
            />
          </label>

          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={appearance.offsetY === null}
              onChange={(event) => patch({ offsetY: event.target.checked ? null : 120 })}
            />
            Centre vertically
          </label>

          {appearance.offsetY !== null && (
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">Distance from the top</span>
              <input
                type="number"
                min={0}
                max={1000}
                className="border-border bg-background rounded border px-2 py-1.5 text-sm"
                value={appearance.offsetY}
                onChange={(event) => patch({ offsetY: Number(event.target.value) })}
              />
            </label>
          )}

          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">
              Size — {Math.round(appearance.scale * 100)}%
            </span>
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.05}
              value={appearance.scale}
              onChange={(event) => patch({ scale: Number(event.target.value) })}
            />
          </label>
        </div>
        <p className="text-muted-foreground text-xs">
          Distances are in 1080p pixels. They mean the same thing at 1440p and 4K — the overlay
          scales with the canvas.
        </p>
      </section>

      <section className="grid gap-3">
        <h3 className="text-sm font-medium">Type and rows</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Font</span>
            <select
              className="border-border bg-background rounded border px-2 py-1.5 text-sm"
              value={appearance.fontFamily}
              onChange={(event) => patch({ fontFamily: event.target.value })}
            >
              <optgroup label="Built in">
                {FONT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
              {customFonts.length > 0 && (
                <optgroup label="Your fonts">
                  {customFonts.map((font) => (
                    <option key={font.family} value={fontFamilyValue(font.family)}>
                      {font.family}
                    </option>
                  ))}
                </optgroup>
              )}
              {/*
               * A value that matches neither list means the font it referred to was removed. Kept
               * as an option so the select does not silently jump to something else and quietly
               * change what is on air.
               */}
              {!FONT_OPTIONS.some((option) => option.value === appearance.fontFamily) &&
                !customFonts.some(
                  (font) => fontFamilyValue(font.family) === appearance.fontFamily,
                ) && (
                  <option value={appearance.fontFamily}>
                    {appearance.fontFamily.split(',')[0]?.replace(/'/g, '')} (missing)
                  </option>
                )}
            </select>
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Teams shown</span>
            <input
              type="number"
              min={1}
              max={25}
              className="border-border bg-background rounded border px-2 py-1.5 text-sm"
              value={appearance.maxTeams}
              onChange={(event) => patch({ maxTeams: Number(event.target.value) })}
            />
          </label>

          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={appearance.showLegend}
              onChange={(event) => patch({ showLegend: event.target.checked })}
            />
            Show the colour legend
          </label>
        </div>
      </section>

      <section className="grid gap-3">
        <div>
          <h3 className="text-sm font-medium">Panel</h3>
          <p className="text-muted-foreground text-xs">
            These sit over live video, so their opacity matters as much as their colour.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorField
            label="Background"
            hint="Behind the team rows"
            value={appearance.colors.background}
            allowAlpha
            onChange={(value) => patchColor('background', value)}
          />
          <ColorField
            label="Header background"
            hint="Behind the column titles and the legend"
            value={appearance.colors.headerBackground}
            allowAlpha
            onChange={(value) => patchColor('headerBackground', value)}
          />
          <ColorField
            label="Row stripe"
            hint="Every other row, to keep long lists readable"
            value={appearance.colors.rowAltBackground}
            allowAlpha
            onChange={(value) => patchColor('rowAltBackground', value)}
          />
          <ColorField
            label="Accent"
            hint="The strip along the top and the line under the header"
            value={appearance.colors.accent}
            allowAlpha
            onChange={(value) => patchColor('accent', value)}
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-sm font-medium">Players and type</h3>
        <div className="grid grid-cols-2 gap-4">
          <ColorField
            label="Alive"
            hint="Health bar for a player still up"
            value={appearance.colors.playerAlive}
            onChange={(value) => patchColor('playerAlive', value)}
          />
          <ColorField
            label="Knocked"
            hint="Downed but revivable"
            value={appearance.colors.playerKnocked}
            onChange={(value) => patchColor('playerKnocked', value)}
          />
          <ColorField
            label="Eliminated"
            value={appearance.colors.playerDead}
            onChange={(value) => patchColor('playerDead', value)}
          />
          <ColorField
            label="Text"
            value={appearance.colors.text}
            onChange={(value) => patchColor('text', value)}
          />
          <ColorField
            label="Muted text"
            hint="Column titles and the legend"
            value={appearance.colors.textMuted}
            onChange={(value) => patchColor('textMuted', value)}
          />
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-sm font-medium">Show / hide animation</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Type</span>
            <select
              className="border-border bg-background rounded border px-2 py-1.5 text-sm"
              value={animation.type}
              onChange={(event) =>
                patchAnimation({ type: event.target.value as OverlayAnimationType })
              }
            >
              <option value="fade">Fade</option>
              <option value="wipe">Wipe &mdash; revealed from an edge, panel stays put</option>
              <option value="slide">Slide &mdash; the panel travels in</option>
              <option value="zoom-fade">Zoom</option>
            </select>
          </label>

          {/*
           * Only two of the four types have an edge to come from. Showing the control for the
           * others would be a control that does nothing.
           */}
          {hasDirection ? (
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">From</span>
              <select
                className="border-border bg-background rounded border px-2 py-1.5 text-sm"
                value={animation.direction}
                onChange={(event) =>
                  patchAnimation({ direction: event.target.value as OverlayAnimationDirection })
                }
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </label>
          ) : (
            <span />
          )}

          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Easing</span>
            <select
              className="border-border bg-background rounded border px-2 py-1.5 text-sm"
              value={animation.easing}
              onChange={(event) =>
                patchAnimation({ easing: event.target.value as OverlayAnimation['easing'] })
              }
            >
              <option value="smooth">Smooth</option>
              <option value="snappy">Snappy</option>
              <option value="linear">Linear</option>
            </select>
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">
              Duration &mdash; {animation.durationMs} ms
            </span>
            <input
              type="range"
              min={100}
              max={5000}
              step={50}
              value={animation.durationMs}
              onChange={(event) => patchAnimation({ durationMs: Number(event.target.value) })}
            />
          </label>

          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={animation.withFade}
              disabled={animation.type === 'fade'}
              onChange={(event) => patchAnimation({ withFade: event.target.checked })}
            />
            Cross-fade as well
            <span className="text-muted-foreground text-xs">{fadeHint}</span>
          </label>
        </div>
      </section>

      <section className="grid gap-3">
        <div>
          <h3 className="text-sm font-medium">Rows</h3>
          <p className="text-muted-foreground text-xs">
            Once the panel has arrived, the rows can fade in one after another. They hold their
            place from the start, so the panel does not resize while they fill in.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={animation.rows.enabled}
            onChange={(event) => patchRows({ enabled: event.target.checked })}
          />
          Bring the rows in one by one
        </label>

        {animation.rows.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">
                Gap between rows &mdash; {animation.rows.staggerMs} ms
              </span>
              <input
                type="range"
                min={10}
                max={500}
                step={5}
                value={animation.rows.staggerMs}
                onChange={(event) => patchRows({ staggerMs: Number(event.target.value) })}
              />
              <span className="text-muted-foreground">
                {appearance.maxTeams} rows fill in over {rowSweepSeconds} s
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={animation.rows.reverseOnHide}
                onChange={(event) => patchRows({ reverseOnHide: event.target.checked })}
              />
              <span>
                Reverse it on the way out
                <span className="text-muted-foreground block text-xs">
                  Off, the rows leave with the panel and the graphic clears at once. On, clearing
                  takes a further {rowSweepSeconds} s.
                </span>
              </span>
            </label>
          </div>
        )}
      </section>
    </div>
  );
}
