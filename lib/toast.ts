type Tone = 'success' | 'error';
type Notification = { tone: Tone; message: string };
type Sink = (notification: Notification) => void;

let requested = false;
let sink: Sink | undefined;
const pending: Notification[] = [];
const listeners = new Set<() => void>();

function notify(tone: Tone, message: string) {
  if (sink) return sink({ tone, message });
  pending.push({ tone, message });
  requested = true;
  for (const listener of listeners) listener();
}

/** Load the toast runtime only when a user action produces a notification. */
export const toast = {
  success: (message: string) => notify('success', message),
  error: (message: string) => notify('error', message),
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
