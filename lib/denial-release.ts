const reloadGuards = new Set<() => void>();

/** Runs right before the reload, so an unsaved-changes guard cannot raise a browser dialog over a vacancy the user lost. */
export function beforeDenialReload(release: () => void) {
  reloadGuards.add(release);
  return () => {
    reloadGuards.delete(release);
  };
}

export function releaseDenialGuards() {
  for (const release of reloadGuards) release();
}
