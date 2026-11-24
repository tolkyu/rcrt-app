export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastOptions {
  description?: string;
  action?: ToastAction;
  /** Same id replaces the visible toast instead of stacking another one. */
  id?: string;
  /** Milliseconds; `Infinity` keeps the toast until it is closed. */
  duration?: number;
}

export interface ToastNotification {
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
  id?: string;
  duration: number;
}

type Sink = (notification: ToastNotification) => void;

const DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  warning: 8000,
  error: 8000,
};

/** A toast with an action stays until it is acted on or closed (ui-foundation §4). */
const toastDuration = (tone: ToastTone, options: ToastOptions = {}) =>
  options.duration ?? (options.action ? Infinity : DURATION[tone]);

let requested = false;
let sink: Sink | undefined;
const pending: ToastNotification[] = [];
const listeners = new Set<() => void>();

function notify(tone: ToastTone, title: string, options: ToastOptions = {}) {
  const notification: ToastNotification = {
    tone,
    title,
    description: options.description,
    action: options.action,
    id: options.id,
    duration: toastDuration(tone, options),
  };
  if (sink) return sink(notification);
  const queued = notification.id
    ? pending.findIndex(({ id }) => id === notification.id)
    : -1;
  if (queued === -1) pending.push(notification);
  else pending[queued] = notification;
  requested = true;
  for (const listener of listeners) listener();
}

/** Load the toast runtime only when a user action produces a notification. */
export const toast = {
  success: (title: string, options?: ToastOptions) =>
    notify('success', title, options),
  error: (title: string, options?: ToastOptions) =>
    notify('error', title, options),
  warning: (title: string, options?: ToastOptions) =>
    notify('warning', title, options),
  info: (title: string, options?: ToastOptions) =>
    notify('info', title, options),
};

export const toastRequested = () => requested;
export function subscribeToToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function connectToasts(next: Sink) {
  sink = next;
  for (const notification of pending.splice(0)) next(notification);
  return () => {
    if (sink === next) sink = undefined;
  };
}
