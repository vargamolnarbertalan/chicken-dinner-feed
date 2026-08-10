import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push(tone: ToastTone, message: string): void;
  dismiss(id: number): void;
}

/** Errors stay longer: they usually need reading, and they usually need acting on. */
const LIFETIME_MS: Record<ToastTone, number> = {
  success: 3000,
  info: 3000,
  error: 6000,
};

let nextId = 1;

/**
 * Transient notifications.
 *
 * Timers live with the store rather than with the component so a toast keeps its own countdown even
 * if the view that raised it unmounts — switching tabs mid-save should not strand a message on
 * screen forever, nor cut one short.
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push(tone, message) {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, tone, message }] }));
    setTimeout(() => get().dismiss(id), LIFETIME_MS[tone]);
  },

  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

/** Convenience wrappers, so callers never have to remember the tone strings. */
export const toast = {
  success: (message: string) => useToastStore.getState().push('success', message),
  error: (message: string) => useToastStore.getState().push('error', message),
  info: (message: string) => useToastStore.getState().push('info', message),
};
