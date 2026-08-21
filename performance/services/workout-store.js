// CoachEasier Performance — workout persistence seam (SC7).
//
// Versioned, fail-safe workout state under one namespace
// (state.performanceWorkout in the prototype; inline mirror
// perfNormalizeWorkoutState). Completed history is immutable and the
// ACTIVE session is cleared only AFTER history is safely written
// (archiveCompletedWorkout enforces the ordering). Sync status stays
// honest: this prototype persists on-device only, so records are
// 'device'/'pending' — never a false 'synced'.
//
// Pure module: no DOM, no fetch, no localStorage, no clock.

export const WORKOUT_STATE_VERSION = 1;
export const HISTORY_MAX = 40;

export function createInitialWorkoutState() {
  return {
    stateVersion: WORKOUT_STATE_VERSION,
    active: null,        // in-flight workout_session (recoverable)
    history: [],         // completed workout_session records, newest last
    syncQueue: [],       // ids awaiting future API sync
    syncStatus: 'device',
  };
}

/** Fail-safe normalisation of persisted workout state. */
export function normalizeWorkoutState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createInitialWorkoutState();
  if (typeof raw.stateVersion !== 'number' || raw.stateVersion > WORKOUT_STATE_VERSION) return createInitialWorkoutState();
  let active = raw.active && typeof raw.active === 'object' && raw.active.kind === 'workout_session' && Array.isArray(raw.active.exerciseLogs)
    ? raw.active : null;
  const history = Array.isArray(raw.history)
    ? raw.history.filter((w) => w && typeof w === 'object' && w.kind === 'workout_session' && w.completedAt).slice(-HISTORY_MAX)
    : [];
  // Reconciliation: an active session whose id is already archived is a
  // stale recovery copy (e.g. interruption between archive and cleanup).
  // It must never resume as a duplicate — history is the truth.
  if (active && history.some((w) => w.workoutSessionId === active.workoutSessionId)) active = null;
  return {
    stateVersion: WORKOUT_STATE_VERSION,
    active,
    history,
    syncQueue: Array.isArray(raw.syncQueue) ? raw.syncQueue.filter((x) => typeof x === 'string').slice(-HISTORY_MAX) : [],
    syncStatus: ['device', 'pending', 'synced'].includes(raw.syncStatus) ? raw.syncStatus : 'device',
  };
}

/** Store/replace the active session (autosave path). Pure. */
export function saveActiveSession(stateIn, session) {
  const state = normalizeWorkoutState(stateIn);
  return { ...state, active: structuredClone(session) };
}

/**
 * Archive a COMPLETED workout: history is written first, and only then is
 * the active recovery state cleared — completed work can never be lost to
 * ordering. The workout id joins the sync queue ('pending' honestly means
 * not yet server-synced; no production sync exists in SC7).
 */
export function archiveCompletedWorkout(stateIn, completedWorkout) {
  if (!completedWorkout?.completedAt) throw new Error('not_completed');
  const state = normalizeWorkoutState(stateIn);
  // IDEMPOTENT by workout id: a double Finish, a retry after interruption,
  // or a recovered stale copy can never archive the same workout twice.
  const id = completedWorkout.workoutSessionId;
  if (state.history.some((w) => w.workoutSessionId === id)) {
    return { ...state, active: state.active?.workoutSessionId === id ? null : state.active };
  }
  const history = [...state.history, structuredClone(completedWorkout)].slice(-HISTORY_MAX);
  return {
    ...state,
    history,                                  // 1. history safely written
    active: null,                             // 2. only then recovery state cleared
    syncQueue: state.syncQueue.includes(id) ? state.syncQueue : [...state.syncQueue, id].slice(-HISTORY_MAX),
    syncStatus: 'pending',
  };
}

export function getHistory(stateIn) {
  return normalizeWorkoutState(stateIn).history.slice().reverse(); // newest first
}

/**
 * Previous bests per exercise for PR detection. COMPARABILITY RULES: only
 * kg-typed loads participate (lb, machine stacks, bands and percentages
 * are never cross-compared), and the best is stored with its implement
 * count — a pair best and a single-implement best are different records.
 * Substituted-in performances are excluded (not comparable history).
 */
export function previousBestsFromHistory(stateIn) {
  const bests = {};
  for (const w of normalizeWorkoutState(stateIn).history) {
    for (const log of w.exerciseLogs || []) {
      if (log.substitution) continue;
      for (const set of log.sets || []) {
        if (set.status !== 'completed') continue;
        const load = set.actual?.load;
        if (!load || load.type !== 'kg' || !Number.isFinite(load.value)) continue;
        const implementCount = load.implements || 1;
        const key = `${log.exerciseId}|x${implementCount}`;
        if (bests[key] === undefined || load.value > bests[key]) bests[key] = load.value;
      }
    }
  }
  return bests;
}

/** Classified prior exposures for one exercise (for SC6 previews). */
export function priorExposuresForExercise(stateIn, exerciseId, exposuresFromWorkoutFn) {
  const out = [];
  for (const w of normalizeWorkoutState(stateIn).history) {
    for (const e of exposuresFromWorkoutFn(w)) {
      if (e.exerciseId === exerciseId) out.push(e.classified);
    }
  }
  return out;
}
