import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { LeaderboardOverlay } from '@/components/overlay/LeaderboardOverlay';
import { u } from '@/components/overlay/overlay-scale';
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
  const overlay = useLiveStore((state) => state.overlay);
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

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: u(24),
        transform: 'translateY(-50%)',
      }}
    >
      {/*
       * `initial={false}` suppresses the animation on first paint only: an overlay that was already
       * on air when the page loaded must simply be there, not slide in as though a director had
       * just triggered it. Later show/hide transitions animate normally.
       */}
      <AnimatePresence initial={false}>
        {overlay.visible && (
          <motion.div
            key="panel"
            initial={{ x: '-115%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-115%', opacity: 0 }}
            // TODO: drive duration and easing from the per-instance settings once the admin exists;
            // these match the --overlay-anim-* tokens by hand for now.
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <LeaderboardOverlay match={snapshot.match} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
