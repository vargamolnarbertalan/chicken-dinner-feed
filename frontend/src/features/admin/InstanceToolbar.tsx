import type { OverlayInstance } from '@cdf/shared';
import { Trash2 } from 'lucide-react';
import { OnAirBadge } from './OnAirBadge';

export interface InstanceToolbarProps {
  instance: OverlayInstance;
  /** Undefined until the live channel reports it — see `OnAirBadge`. */
  visible: boolean | undefined;
  /** False when the draft matches what was last saved. */
  isDirty: boolean;
  onRename(name: string): void;
  onSave(): void;
  onToggleVisibility(): void;
  onDelete(): void;
}

/**
 * The controls that have to stay reachable while the appearance editor is scrolled: rename, save,
 * put on air, delete.
 *
 * Kept with the preview rather than at the top of the form, so adjusting an animation at the bottom
 * of a long page still shows the result and offers the Save button without scrolling back up.
 */
export function InstanceToolbar({
  instance,
  visible,
  isDirty,
  onRename,
  onSave,
  onToggleVisibility,
  onDelete,
}: InstanceToolbarProps) {
  return (
    <div className="border-border bg-card grid gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="overlay-name">
          Overlay name
        </label>
        <input
          id="overlay-name"
          type="text"
          className="border-border bg-background min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
          value={instance.name}
          onChange={(event) => onRename(event.target.value)}
        />

        <button
          type="button"
          className="text-destructive hover:bg-destructive/10 grid size-8 shrink-0 place-items-center rounded transition-colors"
          onClick={onDelete}
          aria-label={`Delete “${instance.name}”`}
          title={`Delete “${instance.name}”`}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty}
          /*
           * The pulse is a CSS animation on purpose: the reduced-motion rule in globals.css already
           * neutralises those on admin surfaces, so an operator who has asked for less movement
           * gets a still button without any extra branch here.
           */
          className={`rounded px-3 py-1.5 text-sm font-medium transition-opacity ${
            isDirty
              ? 'bg-primary text-primary-foreground cdf-attention'
              : 'bg-secondary text-muted-foreground cursor-not-allowed'
          }`}
        >
          Save
        </button>

        {/*
         * Said in words as well as shown by the pulse. State conveyed only by movement or colour is
         * invisible to anyone who cannot perceive it, and this one decides whether what you are
         * looking at is on air yet.
         */}
        <span className="text-xs" role="status" aria-live="polite">
          {isDirty ? (
            <span className="text-[var(--brand-gold)]">Unsaved changes</span>
          ) : (
            <span className="text-muted-foreground">Saved</span>
          )}
        </span>

        <div className="border-border ml-auto flex items-center gap-2 rounded border px-2 py-1">
          <OnAirBadge visible={visible} />
          <button
            type="button"
            className="hover:bg-secondary rounded px-2 py-1 text-sm"
            onClick={onToggleVisibility}
          >
            {visible === true ? 'Hide it' : visible === false ? 'Show it' : 'Show / hide'}
          </button>
        </div>
      </div>
    </div>
  );
}
