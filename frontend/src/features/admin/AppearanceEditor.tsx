import type { OverlayAppearance, OverlayColors } from '@cdf/shared';

const COLOR_FIELDS: { key: keyof OverlayColors; label: string; hint?: string }[] = [
  { key: 'playerAlive', label: 'Alive', hint: 'Health bar for a player still up' },
  { key: 'playerKnocked', label: 'Knocked', hint: 'Downed but revivable' },
  { key: 'playerDead', label: 'Eliminated' },
  { key: 'accent', label: 'Accent' },
  { key: 'text', label: 'Text' },
  { key: 'textMuted', label: 'Muted text' },
];

const FONT_OPTIONS = [
  { value: "'Inter', system-ui, sans-serif", label: 'Inter' },
  { value: "'Rajdhani', system-ui, sans-serif", label: 'Rajdhani' },
  { value: "'Barlow Condensed', system-ui, sans-serif", label: 'Barlow Condensed' },
  { value: 'system-ui, sans-serif', label: 'System' },
  { value: "'Courier New', monospace", label: 'Monospace' },
];

/**
 * Colour inputs need a hex value; the stored colours may be `rgba(...)` for the translucent panel
 * backgrounds. Rather than convert — and quietly drop the alpha an operator needs for a background
 * that sits over video — translucent values are edited as text.
 */
function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export interface AppearanceEditorProps {
  appearance: OverlayAppearance;
  onChange(appearance: OverlayAppearance): void;
}

export function AppearanceEditor({ appearance, onChange }: AppearanceEditorProps) {
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
              {FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
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
        <h3 className="text-sm font-medium">Colours</h3>
        <div className="grid grid-cols-2 gap-3">
          {COLOR_FIELDS.map((field) => {
            const value = appearance.colors[field.key];
            return (
              <label key={field.key} className="grid gap-1 text-xs">
                <span className="text-muted-foreground">{field.label}</span>
                <div className="flex items-center gap-2">
                  {isHex(value) ? (
                    <input
                      type="color"
                      className="border-border h-8 w-10 rounded border bg-transparent"
                      value={value}
                      onChange={(event) => patchColor(field.key, event.target.value)}
                      aria-label={field.label}
                    />
                  ) : null}
                  <input
                    type="text"
                    className="border-border bg-background w-full rounded border px-2 py-1.5 font-mono text-xs"
                    value={value}
                    onChange={(event) => patchColor(field.key, event.target.value)}
                  />
                </div>
                {field.hint && <span className="text-muted-foreground">{field.hint}</span>}
              </label>
            );
          })}
        </div>

        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer">
            Panel backgrounds (translucent — edit as text)
          </summary>
          <div className="mt-2 grid gap-2">
            {(['background', 'headerBackground', 'rowAltBackground'] as const).map((key) => (
              <label key={key} className="grid gap-1">
                <span className="text-muted-foreground">{key}</span>
                <input
                  type="text"
                  className="border-border bg-background rounded border px-2 py-1.5 font-mono text-xs"
                  value={appearance.colors[key]}
                  onChange={(event) => patchColor(key, event.target.value)}
                />
              </label>
            ))}
          </div>
        </details>
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
