import type { MatchState, OverlayAppearance } from '@cdf/shared';
import { useState, type CSSProperties } from 'react';
import { LeaderboardOverlay } from '@/components/overlay/LeaderboardOverlay';

type PreviewMode = 'canvas' | 'actual';

const CANVAS_WIDTH = 560;

/** A checkerboard stands in for live video, so translucent backgrounds can be judged, not guessed. */
const CHECKERBOARD: CSSProperties = {
  backgroundColor: '#18181b',
  backgroundImage:
    'linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
};

export interface OverlayPreviewProps {
  match: MatchState | null;
  appearance: OverlayAppearance;
}

/**
 * Live preview: the **real** overlay component, driven by the real match state.
 *
 * This is the whole reason the admin is a route in the same app rather than a separate one
 * (ADR-0008) — a lookalike preview would drift from what actually goes on air.
 *
 * Two modes, because one cannot do both jobs. The panel occupies under a fifth of the broadcast
 * canvas, so a preview that shows the whole 16∶9 frame renders it at roughly 100 px wide — fine for
 * checking placement, useless for judging a colour or whether a name is legible. **Actual size**
 * renders at true 1080p pixels so those decisions can actually be made.
 *
 * Both work by overriding `--overlay-base-unit`, which is exactly what that property was split out
 * for: the operator's size setting still multiplies on top in either mode.
 */
export function OverlayPreview({ match, appearance }: OverlayPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('canvas');

  const unit = mode === 'canvas' ? CANVAS_WIDTH / 1920 : 1;

  const position: CSSProperties =
    mode === 'canvas'
      ? {
          position: 'absolute',
          top: appearance.offsetY === null ? '50%' : `calc(${appearance.offsetY} * ${unit}px)`,
          transform: appearance.offsetY === null ? 'translateY(-50%)' : undefined,
          ...(appearance.anchor === 'left'
            ? { left: `calc(${appearance.offsetX} * ${unit}px)` }
            : { right: `calc(${appearance.offsetX} * ${unit}px)` }),
        }
      : { padding: 16 };

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1 text-xs">
        {(
          [
            ['canvas', 'Full canvas'],
            ['actual', 'Actual size'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded px-2 py-1 ${
              mode === value ? 'bg-secondary' : 'text-muted-foreground hover:bg-secondary/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="border-border relative overflow-auto rounded border"
        style={{
          width: CANVAS_WIDTH,
          ...(mode === 'canvas' ? { aspectRatio: '16 / 9' } : { maxHeight: 520 }),
          ...CHECKERBOARD,
        }}
      >
        <div
          style={
            {
              // Only the base is overridden; the operator's size setting still multiplies on top.
              '--overlay-base-unit': `${unit}px`,
              ...(mode === 'canvas' ? { position: 'absolute', inset: 0 } : {}),
            } as CSSProperties
          }
        >
          {match ? (
            <div style={position}>
              <LeaderboardOverlay match={match} appearance={appearance} />
            </div>
          ) : (
            <p className="text-muted-foreground grid h-40 place-items-center text-xs">
              Waiting for match data…
            </p>
          )}
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {mode === 'canvas'
          ? 'The whole 16∶9 frame — use this to judge placement.'
          : 'True 1080p pixels — use this to judge colours and legibility.'}
      </p>
    </div>
  );
}
