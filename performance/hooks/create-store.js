// CoachEasier Performance — state seam (SC1).
//
// The main app keeps screen state in module-level variables and re-renders
// via render*() calls. This tiny observable store gives Performance the same
// ergonomics with a testable seam: future engine features subscribe to
// slices instead of reaching into globals. No engine logic lives here.

/**
 * Create a minimal observable store.
 * @template T
 * @param {T} initial
 */
export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();

  return {
    /** Current snapshot (shallow copy — mutate via set/update only). */
    get() { return { ...state }; },

    /** Shallow-merge a partial update and notify subscribers. */
    set(partial) {
      state = { ...state, ...partial };
      for (const fn of listeners) fn(state);
    },

    /** Functional update: set(fn(current)). */
    update(fn) {
      this.set(fn({ ...state }) || {});
    },

    /**
     * Subscribe to changes. Returns an unsubscribe function.
     * @param {(state: T) => void} fn
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Default UI state for the SC1 shells. */
export function createPerformanceUiStore() {
  return createStore({
    screen: 'dashboard',        // dashboard | athletes | programmes | workouts | library | analytics | tools | settings
    librarySearch: '',
    libraryCategory: 'all',
    libraryFavouritesOnly: false,
  });
}
