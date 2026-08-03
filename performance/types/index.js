// CoachEasier Performance — data shapes (SC1).
// JSDoc typedefs only; no runtime behaviour beyond the enum constants.
// Keep this module free of DOM, fetch, and localStorage.

/**
 * @typedef {Object} PerfAthlete
 * @property {string}  id            Stable athlete id (mirrors roster player id).
 * @property {string}  name          Display name.
 * @property {string}  position      Rugby position label, e.g. "Openside Flanker".
 * @property {number}  [jersey]      Squad number, when assigned.
 * @property {string}  [programmeId] Active programme id, if enrolled.
 * @property {string}  [programme]   Active programme display name.
 * @property {number}  adherence     Rolling 4-week session adherence, 0–100.
 * @property {number}  readiness     Latest readiness score, 0–100.
 * @property {('full'|'modified'|'unavailable')} trainingStatus
 * @property {string}  [lastSession] ISO date of last completed session.
 */

/**
 * @typedef {Object} PerfProgramme
 * @property {string}  id
 * @property {string}  name          e.g. "Pre-Season Strength Block".
 * @property {string}  focus         Primary quality, e.g. "Max Strength".
 * @property {number}  weeks         Total length in weeks.
 * @property {number}  currentWeek   1-based week now in progress.
 * @property {number}  athleteCount  Athletes currently enrolled.
 * @property {number}  sessionsPerWeek
 * @property {('draft'|'active'|'completed'|'archived')} status
 * @property {string}  [startDate]   ISO date the block started.
 */

/**
 * @typedef {Object} PerfWorkout
 * @property {string}  id
 * @property {string}  title         e.g. "Lower Body Strength — Week 3, Day 2".
 * @property {string}  programmeId
 * @property {string}  [scheduled]   ISO datetime the session is scheduled for.
 * @property {number}  blocks        Number of blocks (warm-up, main, accessory…).
 * @property {number}  estimatedMinutes
 * @property {('scheduled'|'in_progress'|'completed'|'skipped')} status
 * @property {number}  assignedCount Athletes this session is assigned to.
 * @property {number}  completedCount Athletes who have logged it complete.
 */

/**
 * @typedef {Object} PerfExercise
 * @property {string}  id
 * @property {string}  name          e.g. "Trap Bar Deadlift".
 * @property {string}  category      One of EXERCISE_CATEGORIES ids.
 * @property {string}  equipment     e.g. "Barbell", "Bodyweight".
 * @property {boolean} favourite
 */

/**
 * @typedef {Object} PerfMetricSummary
 * @property {string}  id            One of ANALYTICS_METRICS ids.
 * @property {string}  label
 * @property {string}  headline      Formatted headline value, e.g. "142 kg".
 * @property {string}  detail        Supporting line, e.g. "Squad avg 1RM back squat".
 * @property {number}  trend         Signed % change over the comparison window.
 * @property {number[]} spark        Recent values for the sparkline placeholder.
 */

/**
 * @typedef {Object} PerfActivityEvent
 * @property {string}  id
 * @property {string}  when          ISO datetime.
 * @property {string}  athlete       Display name (or "Squad").
 * @property {string}  summary       One-line description of what happened.
 * @property {('workout'|'programme'|'readiness'|'pb'|'note')} kind
 */

// ── Enumerations shared by screens and services ─────────────────────────────

export const EXERCISE_CATEGORIES = [
  { id: 'strength',     label: 'Strength' },
  { id: 'power',        label: 'Power' },
  { id: 'speed',        label: 'Speed & Agility' },
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'mobility',     label: 'Mobility' },
  { id: 'prehab',       label: 'Prehab' },
  { id: 'core',         label: 'Core' },
];

export const ANALYTICS_METRICS = [
  { id: 'strength',     label: 'Strength' },
  { id: 'power',        label: 'Power' },
  { id: 'speed',        label: 'Speed' },
  { id: 'conditioning', label: 'Conditioning' },
  { id: 'adherence',    label: 'Adherence' },
  { id: 'bodyweight',   label: 'Bodyweight' },
  { id: 'readiness',    label: 'Readiness' },
];

export const COACH_TOOLS = [
  { id: 'assignments',     label: 'Assignments',     blurb: 'Assign programmes and one-off sessions to athletes or units.' },
  { id: 'templates',       label: 'Templates',       blurb: 'Reusable session and block templates for faster planning.' },
  { id: 'compliance',      label: 'Compliance',      blurb: 'Who has trained, who is behind, and who needs a nudge.' },
  { id: 'reports',         label: 'Reports',         blurb: 'Exportable squad and athlete performance reports.' },
  { id: 'team_monitoring', label: 'Team Monitoring', blurb: 'Live squad load, readiness and flag overview.' },
];

export const TRAINING_STATUSES = ['full', 'modified', 'unavailable'];
export const PROGRAMME_STATUSES = ['draft', 'active', 'completed', 'archived'];
export const WORKOUT_STATUSES = ['scheduled', 'in_progress', 'completed', 'skipped'];
