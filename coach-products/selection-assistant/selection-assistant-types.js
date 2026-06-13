/**
 * Coach Products — AI Selection Assistant Types (M22)
 *
 * Rugby-union (XV) selection model and scoring constants.
 * No Brain imports beyond pure learning-type constants (see personaliser.js).
 */

export const SA_ID      = 'selection-assistant'
export const SA_VERSION = '1.0'

/** Feature flags (absent = enabled, opt-out pattern). */
export const SELECTION_FLAG       = 'ai.selectionAssistant'
export const PERSONALISATION_FLAG = 'ai.personalisation'

/** Minimum CoachProfile observations before personalisation engages. */
export const MIN_PROFILE_OBSERVATIONS = 3

/** Squad shape. */
export const SQUAD_SIZE = 15
export const BENCH_SIZE = 8

/** Positional groups. */
export const GROUP = Object.freeze({
  FRONT_ROW:  'front_row',
  SECOND_ROW: 'second_row',
  BACK_ROW:   'back_row',
  HALF_BACK:  'half_back',
  MIDFIELD:   'midfield',
  BACK_THREE: 'back_three',
})

/** The 15 jersey positions, in number order. */
export const POSITIONS = Object.freeze([
  { jersey: 1,  code: 'LHP', name: 'Loosehead Prop',   group: GROUP.FRONT_ROW },
  { jersey: 2,  code: 'HK',  name: 'Hooker',           group: GROUP.FRONT_ROW },
  { jersey: 3,  code: 'THP', name: 'Tighthead Prop',   group: GROUP.FRONT_ROW },
  { jersey: 4,  code: 'L4',  name: 'Lock',             group: GROUP.SECOND_ROW },
  { jersey: 5,  code: 'L5',  name: 'Lock',             group: GROUP.SECOND_ROW },
  { jersey: 6,  code: 'BF',  name: 'Blindside Flanker', group: GROUP.BACK_ROW },
  { jersey: 7,  code: 'OF',  name: 'Openside Flanker', group: GROUP.BACK_ROW },
  { jersey: 8,  code: 'N8',  name: 'Number 8',         group: GROUP.BACK_ROW },
  { jersey: 9,  code: 'SH',  name: 'Scrum-half',       group: GROUP.HALF_BACK },
  { jersey: 10, code: 'FH',  name: 'Fly-half',         group: GROUP.HALF_BACK },
  { jersey: 11, code: 'LW',  name: 'Left Wing',        group: GROUP.BACK_THREE },
  { jersey: 12, code: 'IC',  name: 'Inside Centre',    group: GROUP.MIDFIELD },
  { jersey: 13, code: 'OC',  name: 'Outside Centre',   group: GROUP.MIDFIELD },
  { jersey: 14, code: 'RW',  name: 'Right Wing',       group: GROUP.BACK_THREE },
  { jersey: 15, code: 'FB',  name: 'Fullback',         group: GROUP.BACK_THREE },
])

export const JERSEYS = Object.freeze(POSITIONS.map(p => p.jersey))
export const POSITION_BY_JERSEY = Object.freeze(
  Object.fromEntries(POSITIONS.map(p => [p.jersey, p])),
)

/** Key positional sets. */
export const FRONT_ROW_JERSEYS = Object.freeze([1, 2, 3])
export const LOCK_JERSEYS      = Object.freeze([4, 5])
export const BACK_ROW_JERSEYS  = Object.freeze([6, 7, 8])
export const JUMPER_JERSEYS    = Object.freeze([4, 5, 6, 7, 8])
export const BACK_THREE_JERSEYS = Object.freeze([11, 14, 15])
export const CENTRE_JERSEYS    = Object.freeze([12, 13])

/**
 * Deterministic tie-break order for filling jerseys — scarcer / safety-critical
 * specialist positions are assigned first (tighthead is famously scarce).
 */
export const FILL_PRIORITY = Object.freeze([3, 2, 1, 10, 9, 8, 7, 6, 4, 5, 15, 14, 11, 13, 12])

/** Player availability status. */
export const PLAYER_STATUS = Object.freeze({
  FIT:         'fit',
  DOUBTFUL:    'doubtful',
  INJURED:     'injured',
  UNAVAILABLE: 'unavailable',
  SUSPENDED:   'suspended',
})

/** Coverage health for a positional area. */
export const COVERAGE = Object.freeze({
  SECURE:  'secure',
  THIN:    'thin',
  EXPOSED: 'exposed',
  UNKNOWN: 'unknown',
})

/** Severity for warnings / risks / changes. */
export const SEVERITY = Object.freeze({
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
})

// ── Merit scoring constants (deterministic) ──────────────────────────────────

export const MERIT_PRIMARY   = 100   // player's first listed (specialist) position
export const MERIT_SECONDARY = 70    // a listed secondary position
export const MERIT_GROUP     = 40    // out-of-position cover within the same group
export const FORM_WEIGHT     = 0.2   // form (0–100) → up to +20
export const LOAD_PENALTY    = 0.1   // minutesLoad (0–100) → up to −10
export const FIT_BONUS       = 5     // status === fit
export const DOUBTFUL_PENALTY = 15   // status === doubtful

/** A selected player whose minutesLoad ≥ this is flagged as a load risk. */
export const HIGH_LOAD_THRESHOLD = 85

// ── Output caps ──────────────────────────────────────────────────────────────

export const MAX_WARNINGS  = 8
export const MAX_CHANGES   = 8
export const MAX_RISKS     = 8
