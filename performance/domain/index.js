// CoachEasier Performance — pure display-level domain rules (SC1).
// No engine logic: these are the small, testable rules the navigation shells
// need to present data honestly. Free of DOM, fetch, and localStorage.

import { PROGRAMME_STATUSES, TRAINING_STATUSES, WORKOUT_STATUSES } from '../types/index.js';

/**
 * Percentage of a programme completed, clamped to 0–100.
 * Week N in progress means N-1 full weeks are behind us.
 * @param {{weeks:number, currentWeek:number}} programme
 * @returns {number} integer 0–100
 */
export function programmeProgress(programme) {
  const weeks = Number(programme?.weeks) || 0;
  if (weeks <= 0) return 0;
  const done = Math.min(Math.max((Number(programme?.currentWeek) || 0) - 1, 0), weeks);
  return Math.round((done / weeks) * 100);
}

/**
 * Band a 0–100 readiness score for display.
 * @param {number} score
 * @returns {('high'|'moderate'|'low')}
 */
export function readinessBand(score) {
  const s = Number(score) || 0;
  if (s >= 80) return 'high';
  if (s >= 60) return 'moderate';
  return 'low';
}

/**
 * Band a 0–100 adherence percentage for display.
 * @param {number} pct
 * @returns {('on_track'|'watch'|'behind')}
 */
export function adherenceBand(pct) {
  const p = Number(pct) || 0;
  if (p >= 85) return 'on_track';
  if (p >= 65) return 'watch';
  return 'behind';
}

/**
 * Completion summary for a workout assignment.
 * @param {{assignedCount:number, completedCount:number}} workout
 * @returns {{done:number, total:number, pct:number}}
 */
export function workoutCompletion(workout) {
  const total = Math.max(Number(workout?.assignedCount) || 0, 0);
  const done = Math.min(Math.max(Number(workout?.completedCount) || 0, 0), total);
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** @param {string} status */
export function isValidProgrammeStatus(status) {
  return PROGRAMME_STATUSES.includes(status);
}

/** @param {string} status */
export function isValidWorkoutStatus(status) {
  return WORKOUT_STATUSES.includes(status);
}

/** @param {string} status */
export function isValidTrainingStatus(status) {
  return TRAINING_STATUSES.includes(status);
}

/**
 * Filter + search the exercise library. Pure and case-insensitive.
 * @param {Array<{name:string, category:string, equipment:string, favourite:boolean}>} exercises
 * @param {{query?:string, category?:string, favouritesOnly?:boolean}} opts
 */
export function filterExercises(exercises, { query = '', category = 'all', favouritesOnly = false } = {}) {
  const q = String(query).trim().toLowerCase();
  return (exercises || []).filter((ex) => {
    if (favouritesOnly && !ex.favourite) return false;
    if (category !== 'all' && ex.category !== category) return false;
    if (q && !`${ex.name} ${ex.equipment}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
