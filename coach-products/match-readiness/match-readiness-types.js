/**
 * Coach Products — Match Readiness Intelligence Types (M21)
 *
 * Constants for the Match Readiness product.
 * Imported by match-readiness.js, personaliser.js, and tests.
 * No Brain imports beyond pure learning-type constants — see personaliser.js.
 */

/** Product identity. */
export const MR_ID      = 'match-readiness'
export const MR_VERSION = '2.0'

/** Feature flags (absent = enabled, opt-out pattern). */
export const MATCH_READINESS_FLAG = 'ai.matchReadiness'
export const PERSONALISATION_FLAG = 'ai.personalisation'

/** Minimum CoachProfile observations before personalisation engages. */
export const MIN_PROFILE_OBSERVATIONS = 3

/** Selection-risk levels. */
export const SELECTION_RISK = Object.freeze({
  LOW:     'low',
  MEDIUM:  'medium',
  HIGH:    'high',
  UNKNOWN: 'unknown',
})

/** Training load status. */
export const LOAD_STATUS = Object.freeze({
  ON_TRACK: 'on_track',
  BEHIND:   'behind',
  AT_RISK:  'at_risk',
  UNKNOWN:  'unknown',
})

/** Severity on concerns, players, and actions. */
export const SEVERITY = Object.freeze({
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
})

/** Overall readiness verdict (derived from overallScore). */
export const VERDICT = Object.freeze({
  READY:             'ready',
  READY_WITH_RISKS:  'ready_with_risks',
  NOT_READY:         'not_ready',
  INSUFFICIENT_DATA: 'insufficient_data',
})

/** All top-level fields in a MatchReadinessResponse (for defensive iteration). */
export const MR_FIELD = Object.freeze({
  OVERALL_SCORE:        'overallScore',
  CONFIDENCE:           'confidence',
  AVAILABILITY_SCORE:   'availabilityScore',
  FITNESS_SCORE:        'fitnessScore',
  COHESION_SCORE:       'cohesionScore',
  SELECTION_RISK:       'selectionRisk',
  TRAINING_LOAD_STATUS: 'trainingLoadStatus',
  KEY_CONCERNS:         'keyConcerns',
  CRITICAL_PLAYERS:     'criticalPlayers',
  RECOMMENDED_ACTIONS:  'recommendedActions',
  TRAINING_FOCUS:       'trainingFocus',
})

// ── Scoring constants (deterministic) ────────────────────────────────────────

/** Training load: estimatedMinutes / (total × target) × 100 = completionPct. */
export const LOAD_TARGET_MINUTES_PER_ACTION = 30
export const LOAD_ON_TRACK_THRESHOLD        = 80   // ≥80% → on_track
export const LOAD_BEHIND_THRESHOLD          = 60   // 60–79% → behind; <60 → at_risk

/** Neutral baseline used when a dimension has partial (but not zero) signal. */
export const NEUTRAL_BASELINE = 70

/** Weights for the overall composite (renormalised over present components). */
export const WEIGHT = Object.freeze({
  AVAILABILITY: 0.40,
  FITNESS:      0.35,
  COHESION:     0.25,
})

/** Verdict thresholds on overallScore. */
export const VERDICT_READY_THRESHOLD = 75   // ≥75 → ready
export const VERDICT_RISK_THRESHOLD  = 55   // 55–74 → ready_with_risks; <55 → not_ready

/** Penalties. */
export const INJURY_FITNESS_PENALTY      = 12   // per injury concern, off fitness
export const MAX_INJURY_FITNESS_PENALTY  = 40
export const MISSING_COHESION_PENALTY    = 8    // per missing prep action, off cohesion
export const MAX_MISSING_COHESION_PENALTY = 30

/** Output caps. */
export const MAX_KEY_CONCERNS        = 6
export const MAX_CRITICAL_PLAYERS    = 6
export const MAX_RECOMMENDED_ACTIONS = 6
export const MAX_TRAINING_FOCUS      = 5
