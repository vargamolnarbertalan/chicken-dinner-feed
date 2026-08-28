import { useRef, useState } from 'react';
import { useElementWidth } from '@/hooks/useElementWidth';

type PreviewMode = 'canvas' | 'actual';

/** The broadcast canvas the overlay is authored against (ADR-0011). */
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

export interface OverlayPreviewProps {
  instanceId: string;
}

/**
 * The overlay itself, embedded.
 *
 * Not a rendering of the same components — **the actual page**, loaded from the same address a
 * broadcast browser source uses. That makes it identical by construction rather than by
 * maintenance: it holds its own WebSocket connection, its own visibility state, its own fonts and
 * its own animations, so a show/hide triggered from anywhere — this screen, a Stream Deck, a `curl`
 * — plays here exactly as it plays on air. Every overlay feature added later appears here for free.
 *
 * The cost, accepted deliberately: this shows **saved** settings, because that is what is on air.
 * Editing appearance no longer updates the preview as you type; you save and watch. Rehearsing on
 * air is the intended workflow — that is what the test window before a broadcast is for, and the
 * director can key the layer out meanwhile.
 *
 * The frame is rendered at true 1920×1080 and scaled optically, rather than rendered small. Layout
 * rounding therefore happens at broadcast resolution, so what you judge here is what the canvas
 * produces.
 */
export function OverlayPreview({ instanceId }: OverlayPreviewProps) {
  const [mode, setMode] = useState<PreviewMode>('canvas');
  const boxRef = useRef<HTMLDivElement>(null);
  const boxWidth = useElementWidth(boxRef);

  const isCanvas = mode === 'canvas';
  const scale = isCanvas && boxWidth > 0 ? boxWidth / CANVAS_WIDTH : 1;

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
        ref={boxRef}
        className="border-border relative w-full rounded border"
        style={{
          backgroundColor: '#0a1420',
          // Canvas mode fits the whole frame; actual size shows a window onto it and scrolls.
          ...(isCanvas
            ? { aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`, overflow: 'hidden' }
            : { height: 520, overflow: 'auto' }),
        }}
      >
        <iframe
          key={instanceId}
          // `preview` asks the overlay to draw its own backdrop — see the note in OverlayPage.
          src={`/overlay/${instanceId}?preview=1`}
          title={`Live preview of the ${instanceId} overlay`}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          // The preview is for looking at. Letting clicks through would also mean scroll events
          // landing inside the frame instead of scrolling the box in actual-size mode.
          className="pointer-events-none block border-0"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            // The frame keeps its 1920×1080 layout box after scaling, which would otherwise
            // reserve space for the unscaled size in the scrolling mode.
            position: isCanvas ? 'absolute' : 'static',
            top: 0,
            left: 0,
            backgroundColor: 'transparent',
          }}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {isCanvas
          ? 'The whole 16∶9 frame — use this to judge placement. Collapse the sidebar for a bigger preview.'
          : 'True 1080p pixels — use this to judge colours and legibility.'}
      </p>
    </div>
  );
}
