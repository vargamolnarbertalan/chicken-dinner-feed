import type { OverlayVisibility } from '@cdf/shared';

export type OverlayControlListener = (state: OverlayVisibility) => void;

/**
 * Show/hide state per overlay instance, driven by the director rather than by the game.
 *
 * In memory only. Visibility is a moment-to-moment broadcast decision, not a preference: an
 * operator restarting the app mid-show wants overlays back in their default state, not whatever
 * happened to be on screen when it crashed.
 *
 * Instances are created on first reference. Overlay instances are not yet persisted entities, and
 * refusing to answer for an unknown id would mean a browser source pointed at a not-yet-configured
 * instance shows nothing with no explanation.
 */
export class OverlayControlStore {
  private readonly states = new Map<string, OverlayVisibility>();
  private readonly listeners = new Set<OverlayControlListener>();

  /**
   * @param defaultVisible Overlays start visible so that opening one shows something. An operator
   * who wants to start hidden can hide it from Companion before going on air.
   */
  constructor(private readonly defaultVisible = true) {}

  get(instanceId: string): OverlayVisibility {
    const existing = this.states.get(instanceId);
    if (existing) return existing;

    // changedAt of 0 marks "never actually changed", which is how a client tells the state it was
    // born into from one it should animate.
    const created: OverlayVisibility = {
      instanceId,
      visible: this.defaultVisible,
      changedAt: 0,
    };
    this.states.set(instanceId, created);
    return created;
  }

  set(instanceId: string, visible: boolean, now: number = Date.now()): OverlayVisibility {
    const current = this.get(instanceId);

    // Re-pressing "show" on an already-visible overlay must not retrigger the animation — a
    // director tapping a key twice should not make the overlay flicker on air.
    if (current.visible === visible) return current;

    const next: OverlayVisibility = { instanceId, visible, changedAt: now };
    this.states.set(instanceId, next);
    for (const listener of this.listeners) listener(next);
    return next;
  }

  toggle(instanceId: string, now: number = Date.now()): OverlayVisibility {
    return this.set(instanceId, !this.get(instanceId).visible, now);
  }

  subscribe(listener: OverlayControlListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
