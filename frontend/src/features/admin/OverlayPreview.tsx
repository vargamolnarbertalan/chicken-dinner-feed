import type { MatchState, OverlayAppearance } from '@cdf/shared';
import { useState, type CSSProperties } from 'react';
import { LeaderboardOverlay } from '@/components/overlay/LeaderboardOverlay';

type PreviewMode = 'canvas' | 'actual';

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
 * canvas, so a preview that shows the whole 16∶9 frame renders it small — fine for checking
 * placement, useless for judging a colour or whether a name is legible. **Actual size** renders at
 * true 1080p pixels so those decisions can be made.
 *
 * In canvas mode the scale comes from **container query units**: `100cqw / 1920` is one design pixel
 * expressed against whatever width the preview happens to have. That means the preview grows when
 * the sidebar is collapsed, with no measuring, no resize listener and no re-render — the same trick
 * as the viewport-based unit on a real broadcast surface, pointed at a box instead (ADR-0011).
 */
export function OverlayPreview({ match, appearance }: OverlayPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('canvas');

  const isCanvas = mode === 'canvas';
  const baseUnit = isCanvas ? 'calc(100cqw / 1920)' : '1px';

  const position: CSSProperties = isCanvas
    ? {
        position: 'absolute',
        top:
          appearance.offsetY === null
            ? '50%'
            : `calc(${appearance.offsetY} * var(--overlay-base-unit))`,
        transform: appearance.offsetY === null ? 'translateY(-50%)' : undefined,
        ...(appearance.anchor === 'left'
          ? { left: `calc(${appearance.offsetX} * var(--overlay-base-unit))` }
          : { right: `calc(${appearance.offsetX} * var(--overlay-base-unit))` }),
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
        className="border-border relative w-full overflow-auto rounded border"
        style={{
          containerType: 'inline-size',
          ...(isCanvas ? { aspectRatio: '16 / 9' } : { maxHeight: 520 }),
          ...CHECKERBOARD,
        }}
      >
        <div
          style={
            {
              // Only the base is overridden; the operator's size setting still multiplies on top.
              '--overlay-base-unit': baseUnit,
              ...(isCanvas ? { position: 'absolute', inset: 0 } : {}),
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
        {isCanvas
          ? 'The whole 16∶9 frame — use this to judge placement. Collapse the sidebar for a bigger preview.'
          : 'True 1080p pixels — use this to judge colours and legibility.'}
      </p>
    </div>
  );
}
