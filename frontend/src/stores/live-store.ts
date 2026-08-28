import type { CustomFont, LiveSnapshot, OverlayInstance, OverlayVisibility } from '@cdf/shared';
import { create } from 'zustand';
import { applyCustomFontFaces } from '@/lib/font-faces';
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
  /**
   * Visibility by instance id.
   *
   * A map rather than a single value because the admin observes **every** instance — it has to show
   * what is actually on air, including a change a director made from a stream deck. An overlay page
   * only ever receives its own id, so it simply reads its own key.
   */
  overlayStates: Record<string, OverlayVisibility>;
  /** Configuration by instance id. A configured-but-unknown id maps to null. */
  instances: Record<string, OverlayInstance | null>;
  /** Fonts the operator uploaded. Global, but delivered on the same channel. */
  fonts: CustomFont[];
  /**
   * False until the first visibility message has been applied. Lets the overlay appear in its
   * current state on load instead of animating in as though a director had just triggered it.
   */
  hasAnimatedIn: boolean;

  connect(instanceId?: string, options?: { isPreview?: boolean }): () => void;
  markAnimatedIn(): void;
}

export const useLiveStore = create<LiveState>((set, get) => ({
  connection: 'connecting',
  protocolMismatch: null,
  snapshot: null,
  overlayStates: {},
  instances: {},
  fonts: [],
  hasAnimatedIn: false,

  connect(instanceId, options) {
    const connection = new LiveConnection({
      instanceId,
      isPreview: options?.isPreview ?? false,
      onPhase: (phase) => set({ connection: phase }),
      onProtocolMismatch: (serverVersion) => set({ protocolMismatch: serverVersion }),
      onMessage: (message) => {
        switch (message.type) {
          case 'snapshot':
            set({ snapshot: message.snapshot });
            break;
          case 'overlay':
            // Registered as soon as they arrive, so the overlay is never asked to render text in a
            // family the document does not know about yet.
            applyCustomFontFaces(message.fonts);
            set((state) => ({
              overlayStates: {
                ...state.overlayStates,
                [message.overlay.instanceId]: message.overlay,
              },
              instances: {
                ...state.instances,
                [message.overlay.instanceId]: message.instance,
              },
              fonts: message.fonts,
            }));
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
