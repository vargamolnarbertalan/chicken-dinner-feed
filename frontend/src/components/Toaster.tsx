import { AnimatePresence, motion } from 'motion/react';
import { useToastStore, type ToastTone } from '@/stores/toast-store';

const TONE_STYLE: Record<ToastTone, { bar: string; icon: string }> = {
  success: { bar: 'bg-emerald-500', icon: '✓' },
  error: { bar: 'bg-destructive', icon: '!' },
  info: { bar: 'bg-sky-500', icon: 'i' },
};

/**
 * Transient notifications, bottom-right.
 *
 * `aria-live="polite"` rather than `assertive`: these confirm actions the operator just took, and
 * interrupting a screen reader mid-sentence for "Saved" would be worse than waiting.
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
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
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="bg-card border-border pointer-events-auto flex items-start gap-3 overflow-hidden rounded-lg border p-3 shadow-lg"
            >
              <span
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${tone.bar}`}
                aria-hidden
              >
                {tone.icon}
              </span>
              <p className="flex-1 text-sm leading-snug">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="text-muted-foreground hover:text-foreground -m-1 shrink-0 rounded p-1 text-sm leading-none"
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
