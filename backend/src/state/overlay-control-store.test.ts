import { describe, expect, it, vi } from 'vitest';
import { OverlayControlStore } from './overlay-control-store.js';

describe('OverlayControlStore', () => {
  it('reports an unknown instance as visible, never changed', () => {
    // A browser source pointed at a not-yet-configured id must render, not sit blank with no
    // explanation.
    const state = new OverlayControlStore().get('unconfigured');

    expect(state).toEqual({ instanceId: 'unconfigured', visible: true, changedAt: 0 });
  });

  it('records when visibility actually changed', () => {
    const store = new OverlayControlStore();

    const hidden = store.set('main', false, 1_000);

    expect(hidden).toEqual({ instanceId: 'main', visible: false, changedAt: 1_000 });
  });

  it('ignores a change to the state it is already in', () => {
    // A director tapping "show" twice must not restart the animation and flicker on air.
    const store = new OverlayControlStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set('main', false, 1_000);
    listener.mockClear();

    const again = store.set('main', false, 5_000);

    expect(again.changedAt).toBe(1_000);
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies subscribers on a real change', () => {
    const store = new OverlayControlStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set('main', false, 1_000);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      instanceId: 'main',
      visible: false,
      changedAt: 1_000,
    });
  });

  it('toggles from the current state', () => {
    const store = new OverlayControlStore();

    expect(store.toggle('main', 1_000).visible).toBe(false);
    expect(store.toggle('main', 2_000).visible).toBe(true);
  });

  it('keeps instances independent', () => {
    // Hiding one overlay must not touch another, or a director's key press would clear the wrong
    // graphic.
    const store = new OverlayControlStore();

    store.set('main', false, 1_000);

    expect(store.get('secondary').visible).toBe(true);
  });

  it('honours a default of hidden', () => {
    expect(new OverlayControlStore(false).get('main').visible).toBe(false);
  });

  it('stops notifying after unsubscribe', () => {
    const store = new OverlayControlStore();
    const listener = vi.fn();

    store.subscribe(listener)();
    store.set('main', false, 1_000);

    expect(listener).not.toHaveBeenCalled();
  });
});
