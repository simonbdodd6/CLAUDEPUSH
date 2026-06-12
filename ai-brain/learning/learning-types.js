/**
 * AI Brain — Coach Learning Layer Types (M19)
 *
 * Shared constants for the Coach Learning Engine.
 * No Brain imports — pure constants.
 *
 * Architecture note:
 *   Events arrive → observations are stored (append-only)
 *   → preferences are derived (deterministic from observations)
 *   → profile is updated (Learning Engine alone owns writes)
 *   Products and the Integration layer may READ but never write the profile.
 */

/** Schema version. Bump on breaking change to CoachProfile shape. */
export const LEARNING_VERSION = '1.0'

/** Feature flags */
export const LEARNING_FLAG = 'ai.learning'
export const PROFILE_FLAG  = 'ai.coachProfile'

/** Confidence thresholds */
export const CONFIDENCE_SATURATION       = 50   // observations for max confidence
export const PREFERENCE_SATURATION       = 20   // signals for max preference confidence
export const MIN_OBSERVATIONS_FOR_SIGNAL = 3    // below this count returns confidence 0
export const RECENT_ACTIONS_LIMIT        = 25   // stored in recommendationHistory.recentActions
export const MAX_EVIDENCE_REFS           = 10   // max observationIds per preference.evidence
export const MAX_OBSERVATIONS_STORED     = 1000 // ring-buffer cap

/**
 * Event types that the Learning Engine accepts.
 * Each event creates one immutable observation in the profile.
 */
export const EVENT_TYPE = Object.freeze({
  RECOMMENDATION_ACCEPTED: 'recommendation_accepted',
  RECOMMENDATION_IGNORED:  'recommendation_ignored',
  RECOMMENDATION_REJECTED: 'recommendation_rejected',
  RECOMMENDATION_EDITED:   'recommendation_edited',
  PLAYER_SELECTED:         'player_selected',
  PLAYER_DESELECTED:       'player_deselected',
  TRAINING_COMPLETED:      'training_completed',
  MATCH_OUTCOME_RECORDED:  'match_outcome_recorded',
  COACH_PREFERENCE_SET:    'coach_preference_set',   // direct override — highest weight
})

/** The six learnable preference dimensions. */
export const PREFERENCE_KEY = Object.freeze({
  COACHING_STYLE:      'coachingStyle',
  TRAINING_EMPHASIS:   'trainingEmphasis',
  SQUAD_ROTATION:      'squadRotation',
  COMMUNICATION_STYLE: 'communicationStyle',
  RISK_TOLERANCE:      'riskTolerance',
  WORKLOAD_PREFERENCE: 'workloadPreference',
})

/** Coaching style vocabulary. */
export const COACHING_STYLE = Object.freeze({
  DIRECTIVE:     'directive',     // structured, task-focused, rules-driven
  COLLABORATIVE: 'collaborative', // team-input, shared decision-making
  SUPPORTIVE:    'supportive',    // welfare-first, nurturing
})

/** Training emphasis vocabulary. */
export const TRAINING_EMPHASIS = Object.freeze({
  TECHNICAL: 'technical',
  TACTICAL:  'tactical',
  PHYSICAL:  'physical',
  MIXED:     'mixed',
})

/** Squad rotation vocabulary. */
export const SQUAD_ROTATION = Object.freeze({
  HIGH:     'high',     // rotates widely, many players get minutes
  MODERATE: 'moderate',
  LOW:      'low',      // fixed core XI, low rotation
})

/** Communication style vocabulary. */
export const COMMUNICATION_STYLE = Object.freeze({
  DIRECT:     'direct',     // clear, concise, task-oriented
  NURTURING:  'nurturing',  // pastoral, check-ins, welfare conversations
  ANALYTICAL: 'analytical', // data-driven, performance-focused
})

/** Risk tolerance vocabulary. */
export const RISK_TOLERANCE = Object.freeze({
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
})

/** Workload preference vocabulary. */
export const WORKLOAD_PREFERENCE = Object.freeze({
  INTENSIVE:    'intensive',    // high training volume, demands a lot
  MODERATE:     'moderate',
  CONSERVATIVE: 'conservative', // low training load, prioritises rest/recovery
})

/**
 * Signal weight for COACH_PREFERENCE_SET events.
 * Direct preferences override inferred signals 5:1.
 */
export const EXPLICIT_PREFERENCE_WEIGHT = 5
