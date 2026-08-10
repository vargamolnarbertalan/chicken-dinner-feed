import { useEffect, useRef, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  children: ReactNode;
  onConfirm(): void;
  onCancel(): void;
}

/**
 * A modal confirmation.
 *
 * Built on the native `<dialog>` element rather than a hand-rolled overlay: it gives the backdrop,
 * the focus trap, Escape-to-close and the top-layer stacking for free, and gets them right. Rolling
 * those by hand is where accessible modals usually go wrong.
 *
 * Cancel is focused on open, not confirm. This only appears in front of actions that are hard to
 * undo, so an operator hammering Enter should end up not doing the thing.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // Fires for Escape and for the backdrop, both of which mean "no".
      onClose={onCancel}
      onCancel={onCancel}
      className="bg-card text-foreground border-border m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border p-0 shadow-xl backdrop:bg-black/50"
    >
      <div className="grid gap-3 p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="text-muted-foreground grid gap-2 text-sm">{children}</div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="border-border hover:bg-secondary rounded border px-3 py-1.5 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded px-3 py-1.5 text-sm font-medium ${
              destructive
                ? 'bg-destructive text-white hover:opacity-90'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
