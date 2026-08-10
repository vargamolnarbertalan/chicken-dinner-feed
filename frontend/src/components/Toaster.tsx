import { AnimatePresence, motion } from 'motion/react';
import { useToastStore, type ToastTone } from '@/stores/toast-store';

const TONE_STYLE: Record<ToastTone, { badge: string; icon: string }> = {
  success: { badge: 'bg-emerald-500', icon: '✓' },
  error: { badge: 'bg-destructive', icon: '!' },
  info: { badge: 'bg-sky-500', icon: 'i' },
};

/**
 * Transient notifications, bottom centre.
 *
 * Centred rather than in a corner because an operator's attention is on the preview and the
 * controls, not on the edge of the screen — a confirmation nobody notices is not a confirmation.
 *
 * `aria-live="polite"` rather than `assertive`: these confirm actions the operator just took, and
 * interrupting a screen reader mid-sentence for "Saved" would be worse than waiting.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const tone = TONE_STYLE[toast.tone];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97, transition: { duration: 0.18 } }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="bg-card border-border pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-3 shadow-lg"
            >
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${tone.badge}`}
                aria-hidden
              >
                {tone.icon}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-semibold">{toast.title}</p>
                {toast.message && (
                  <p className="text-muted-foreground mt-0.5 text-sm leading-snug font-normal">
                    {toast.message}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="text-muted-foreground hover:text-foreground -m-1 shrink-0 rounded p-1 text-base leading-none"
              >
                ×
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
