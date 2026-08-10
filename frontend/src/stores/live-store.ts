import type { LiveSnapshot, OverlayInstance, OverlayVisibility } from '@cdf/shared';
import { create } from 'zustand';
import { LiveConnection, type ConnectionPhase } from '@/lib/live-connection';

interface LiveState {
  connection: ConnectionPhase;
  /** Set when the backend speaks a protocol this build does not understand. */
  protocolMismatch: number | null;
  /**
   * Last snapshot received, retained when the connection drops.
   *
   * Holding it is the point: an overlay that blanks because the backend restarted mid-match is a
   * visible failure on air, whereas one showing data a few seconds old is usually unnoticeable
   * (ADR-0006).
   */
  snapshot: LiveSnapshot | null;
  overlay: OverlayVisibility | null;
  /** This instance's configuration, or null when the id has not been configured in the admin. */
  instance: OverlayInstance | null;
  /**
   * False until the first visibility message has been applied. Lets the overlay appear in its
   * current state on load instead of animating in as though a director had just triggered it.
   */
  hasAnimatedIn: boolean;

  connect(instanceId?: string): () => void;
  markAnimatedIn(): void;
}

export const useLiveStore = create<LiveState>((set, get) => ({
  connection: 'connecting',
  protocolMismatch: null,
  snapshot: null,
  overlay: null,
  instance: null,
  hasAnimatedIn: false,

  connect(instanceId) {
    const connection = new LiveConnection({
      instanceId,
      onPhase: (phase) => set({ connection: phase }),
      onProtocolMismatch: (serverVersion) => set({ protocolMismatch: serverVersion }),
      onMessage: (message) => {
        switch (message.type) {
          case 'snapshot':
            set({ snapshot: message.snapshot });
            break;
          case 'overlay':
            set({ overlay: message.overlay, instance: message.instance });
            break;
          case 'error':
            console.error('[live] server reported an error:', message.message);
            break;
        }
      },
    });

    connection.connect();
    return () => {
      connection.close();
      // Reset the entry animation guard so a remount behaves like a fresh load.
      if (get().hasAnimatedIn) set({ hasAnimatedIn: false });
    };
  },

  markAnimatedIn() {
    set({ hasAnimatedIn: true });
  },
}));
