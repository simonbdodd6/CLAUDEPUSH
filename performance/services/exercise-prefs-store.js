// CoachEasier Performance — exercise library preferences seam (SC3).
//
// Versioned favourites + recently-viewed state, namespaced under
// state.performanceLibrary in the prototype (kept in lockstep with the
// inline mirror perfNormalizeLibraryState in index.html). Exercise
// DEFINITIONS are never stored here — only references by id, so catalogue
// updates never collide with user state.
//
// Pure module: no DOM, no fetch, no localStorage.

export const LIBRARY_STATE_VERSION = 1;
export const RECENT_MAX = 12;

export function createInitialLibraryState() {
  return {
    stateVersion: LIBRARY_STATE_VERSION,
    favourites: [],   // exercise ids
    recent: [],       // exercise ids, most recent last
  };
}

const isIdList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0 && x.length < 80);

/** Fail-safe normalisation of persisted library preferences. */
export function normalizeLibraryState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createInitialLibraryState();
  if (typeof raw.stateVersion !== 'number' || raw.stateVersion > LIBRARY_STATE_VERSION) return createInitialLibraryState();
  return {
    stateVersion: LIBRARY_STATE_VERSION,
    favourites: isIdList(raw.favourites) ? [...new Set(raw.favourites)].slice(0, 200) : [],
    recent: isIdList(raw.recent) ? raw.recent.slice(-RECENT_MAX) : [],
  };
}

/** Toggle a favourite (pure — returns new state). */
export function toggleFavourite(state, exerciseId) {
  const s = normalizeLibraryState(state);
  const has = s.favourites.includes(exerciseId);
  return {
    ...s,
    favourites: has ? s.favourites.filter((id) => id !== exerciseId) : [...s.favourites, exerciseId],
  };
}

/** Record a view (pure — dedupes, caps, most recent last). */
export function recordView(state, exerciseId) {
  const s = normalizeLibraryState(state);
  const next = [...s.recent.filter((id) => id !== exerciseId), exerciseId];
  return { ...s, recent: next.slice(-RECENT_MAX) };
}
