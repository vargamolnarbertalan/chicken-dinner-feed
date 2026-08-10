import { formatColor, parseColor } from '@/lib/color';

export interface ColorFieldProps {
  label: string;
  hint?: string;
  value: string;
  /** Panel surfaces sit over live video, so they need an opacity control; type does not. */
  allowAlpha?: boolean;
  onChange(value: string): void;
}

/**
 * One colour, with an opacity slider where transparency is meaningful.
 *
 * `<input type="color">` cannot express alpha, and the panel backgrounds are deliberately
 * translucent so the video shows through. Splitting the value into a swatch and an opacity slider
 * keeps both editable without making the operator hand-write `rgba(...)`.
 *
 * A value we cannot parse — `oklch()`, a named colour — falls back to a plain text field rather
 * than being silently rewritten into something we guessed.
 */
export function ColorField({ label, hint, value, allowAlpha = false, onChange }: ColorFieldProps) {
  const parsed = parseColor(value);

  if (!parsed) {
    return (
      <label className="grid gap-1 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <input
          type="text"
          className="border-border bg-background rounded border px-2 py-1.5 font-mono text-xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="text-muted-foreground">Unrecognised format — edit as text</span>
      </label>
    );
  }

  const alphaPercent = Math.round(parsed.alpha * 100);

  return (
    <div className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>

      <div className="flex items-center gap-2">
        {/* Checkerboard behind the swatch, so a translucent colour reads as translucent. */}
        <span
          className="border-border relative size-8 shrink-0 overflow-hidden rounded border"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
            backgroundColor: 'white',
          }}
        >
          <span className="absolute inset-0" style={{ backgroundColor: value }} />
          <input
            type="color"
            aria-label={label}
            className="absolute inset-0 cursor-pointer opacity-0"
            value={parsed.hex}
            onChange={(event) => onChange(formatColor(event.target.value, parsed.alpha))}
          />
        </span>

        <input
          type="text"
          aria-label={`${label} value`}
          className="border-border bg-background w-full rounded border px-2 py-1.5 font-mono text-xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      {allowAlpha && (
        <label className="mt-0.5 grid gap-0.5">
          <span className="text-muted-foreground">Opacity — {alphaPercent}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={alphaPercent}
            onChange={(event) =>
              onChange(formatColor(parsed.hex, Number(event.target.value) / 100))
            }
          />
        </label>
      )}

      {hint && <span className="text-muted-foreground">{hint}</span>}
    </div>
  );
}
