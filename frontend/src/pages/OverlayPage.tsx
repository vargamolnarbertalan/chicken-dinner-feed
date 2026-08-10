import { DEFAULT_OVERLAY_APPEARANCE } from '@cdf/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { appearanceToAnimation, appearanceToPosition } from '@/components/overlay/appearance';
import { LeaderboardOverlay } from '@/components/overlay/LeaderboardOverlay';
import { u } from '@/components/overlay/overlay-scale';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useLiveStore } from '@/stores/live-store';

export interface OverlayPageProps {
  instanceId: string;
}

/**
 * A single overlay instance, rendered for consumption as a broadcast browser source.
 *
 * Nobody is looking at this page in a browser — it is composited over live video. That shapes every
 * decision here: transparent background, no interaction, and nothing rendered until we actually
 * know what should be on screen.
 */
export function OverlayPage({ instanceId }: OverlayPageProps) {
  const snapshot = useLiveStore((state) => state.snapshot);
  const overlay = useLiveStore((state) => state.overlayStates[instanceId]);
  const instance = useLiveStore((state) => state.instances[instanceId] ?? null);
  const protocolMismatch = useLiveStore((state) => state.protocolMismatch);
  const connect = useLiveStore((state) => state.connect);

  useEffect(() => {
    // Marks the whole document as a broadcast surface: transparent, no cursor, no scrollbars.
    // Applied to the root because the browser source captures the entire page.
    document.documentElement.dataset.surface = 'overlay';
    return () => {
      delete document.documentElement.dataset.surface;
    };
  }, []);

  useEffect(() => connect(instanceId), [connect, instanceId]);

  // Falls back to the id until the configuration arrives, so a tab is never nameless — and an
  // unconfigured overlay is still identifiable by the address it was opened with.
  useDocumentTitle(instance?.name ?? instanceId);

  if (protocolMismatch !== null) {
    // Deliberately visible rather than silent (ADR-0007). A browser source left open across an
    // upgrade would otherwise render subtly wrong data, which is worse than an obvious error.
    return (
      <div
        style={{
          position: 'fixed',
          top: u(20),
          left: u(20),
          padding: u(12),
          borderRadius: u(4),
          background: 'oklch(0.35 0.15 25 / 0.92)',
          color: 'white',
          fontFamily: 'var(--overlay-font-family)',
          fontSize: u(14),
        }}
      >
        Overlay is out of date — the server speaks protocol v{protocolMismatch}. Reload this browser
        source.
      </div>
    );
  }

  // Render nothing until both the match state and the visibility are known. Assuming "visible"
  // while waiting would flash the overlay on air whenever a hidden one is reloaded.
  if (!snapshot || !overlay) return null;

  // An unconfigured id still renders, using the defaults. Showing nothing would look identical to a
  // broken connection, and the operator has no way to tell them apart mid-broadcast.
  const appearance = instance?.appearance ?? DEFAULT_OVERLAY_APPEARANCE;
  const animation = appearanceToAnimation(appearance);

  return (
    <div style={appearanceToPosition(appearance)}>
      {/*
       * `initial={false}` suppresses the animation on first paint only: an overlay that was already
       * on air when the page loaded must simply be there, not slide in as though a director had
       * just triggered it. Later show/hide transitions animate normally.
       */}
      <AnimatePresence initial={false}>
        {overlay.visible && (
          <motion.div
            key="panel"
            initial={animation.initial}
            animate={animation.animate}
            exit={animation.exit}
            transition={animation.transition}
          >
            <LeaderboardOverlay match={snapshot.match} appearance={appearance} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
