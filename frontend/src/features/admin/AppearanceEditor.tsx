import type { CustomFont, OverlayAppearance, OverlayColors } from '@cdf/shared';
import { fontFamilyValue } from '@cdf/shared';
import { ColorField } from './ColorField';

const FONT_OPTIONS = [
  { value: "'Inter', system-ui, sans-serif", label: 'Inter' },
  { value: "'Rajdhani', system-ui, sans-serif", label: 'Rajdhani' },
  { value: "'Barlow Condensed', system-ui, sans-serif", label: 'Barlow Condensed' },
  { value: 'system-ui, sans-serif', label: 'System' },
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
            <span className="text-muted-foreground">Direction</span>
            <select
              className="border-border bg-background rounded border px-2 py-1.5 text-sm"
              value={appearance.animation.direction}
              onChange={(event) =>
                patch({
                  animation: {
                    ...appearance.animation,
                    direction: event.target.value as OverlayAppearance['animation']['direction'],
                  },
                })
              }
            >
              <option value="left">Slide from the left</option>
              <option value="right">Slide from the right</option>
              <option value="up">Slide from the top</option>
              <option value="down">Slide from the bottom</option>
              <option value="fade">Fade</option>
            </select>
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">Easing</span>
            <select
              className="border-border bg-background rounded border px-2 py-1.5 text-sm"
              value={appearance.animation.easing}
              onChange={(event) =>
                patch({
                  animation: {
                    ...appearance.animation,
                    easing: event.target.value as OverlayAppearance['animation']['easing'],
                  },
                })
              }
            >
              <option value="smooth">Smooth</option>
              <option value="snappy">Snappy</option>
              <option value="linear">Linear</option>
            </select>
          </label>

          <label className="col-span-2 grid gap-1 text-xs">
            <span className="text-muted-foreground">
              Duration — {appearance.animation.durationMs} ms
            </span>
            <input
              type="range"
              min={0}
              max={1500}
              step={20}
              value={appearance.animation.durationMs}
              onChange={(event) =>
                patch({
                  animation: { ...appearance.animation, durationMs: Number(event.target.value) },
                })
              }
            />
          </label>
        </div>
      </section>
    </div>
  );
}
