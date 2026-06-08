// © 2026 K9 Operations LLC. All Rights Reserved.
// Proprietary and Confidential. Unauthorized copying, modification,
// distribution, or use of this software is strictly prohibited.

// A visibility-aware, coalescing reload scheduler.
//
// Purpose: the app's data layer refreshes itself from two triggers — realtime
// `postgres_changes` events and a periodic safety-net poll. Wiring those triggers
// directly to a heavy `reload()` (e.g. a full multi-table refetch) is the dominant
// source of Supabase egress: a burst of writes fires N immediate reloads, and a
// background/hidden tab keeps polling forever even though nobody is looking at it.
//
// This scheduler encodes the three protections we want everywhere:
//   1. Coalesce  — many `requestReload()` calls inside `debounceMs` collapse to one.
//   2. Visibility-gate — never reload while the document is hidden; instead remember
//      that a refresh is owed and run a single catch-up reload when it becomes visible.
//   3. Poll only when visible — the safety-net interval is suppressed while hidden.
//
// Timers and the visibility source are injectable so the logic is unit-testable in a
// non-DOM environment.

export const DEFAULT_DEBOUNCE_MS = 500;
export const DEFAULT_POLL_MS = 60_000;

const browserTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
};

export function createBrowserVisibility() {
  const hasDoc = typeof document !== "undefined";
  return {
    isVisible: () => (hasDoc ? document.visibilityState !== "hidden" : true),
    subscribe: (cb) => {
      if (!hasDoc) return () => {};
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
  };
}

/**
 * Create a reload scheduler.
 *
 * @param {() => void} reload - the (potentially expensive) refresh to run.
 * @param {object}  [options]
 * @param {number}  [options.debounceMs] - window to coalesce reload requests.
 * @param {number}  [options.pollMs]     - safety-net poll interval (visible only).
 * @param {object}  [options.timers]     - injectable timer functions.
 * @param {object}  [options.visibility] - injectable `{ isVisible, subscribe }`.
 * @returns {{ requestReload: () => void, start: () => void, stop: () => void }}
 */
export function createReloadScheduler(reload, options = {}) {
  const {
    debounceMs = DEFAULT_DEBOUNCE_MS,
    pollMs = DEFAULT_POLL_MS,
    timers = browserTimers,
    visibility = createBrowserVisibility(),
  } = options;

  let debounceTimer = null;
  let pollTimer = null;
  let unsubscribe = null;
  let dirtyWhileHidden = false;
  let started = false;

  const reloadNow = () => {
    if (!started) return;
    if (!visibility.isVisible()) {
      dirtyWhileHidden = true;
      return;
    }
    reload();
  };

  const fireDebounced = () => {
    debounceTimer = null;
    reloadNow();
  };

  const requestReload = () => {
    if (!started) return;
    if (!visibility.isVisible()) {
      // No point fetching for a hidden tab — remember we owe a refresh.
      dirtyWhileHidden = true;
      return;
    }
    if (debounceTimer != null) timers.clearTimeout(debounceTimer);
    debounceTimer = timers.setTimeout(fireDebounced, debounceMs);
  };

  const handleVisibilityChange = () => {
    if (!started) return;
    if (visibility.isVisible() && dirtyWhileHidden) {
      dirtyWhileHidden = false;
      reload();
    }
  };

  const start = () => {
    if (started) return;
    started = true;
    dirtyWhileHidden = false;
    pollTimer = timers.setInterval(reloadNow, pollMs);
    unsubscribe = visibility.subscribe(handleVisibilityChange);
  };

  const stop = () => {
    started = false;
    dirtyWhileHidden = false;
    if (debounceTimer != null) {
      timers.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (pollTimer != null) {
      timers.clearInterval(pollTimer);
      pollTimer = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  return { requestReload, start, stop };
}
