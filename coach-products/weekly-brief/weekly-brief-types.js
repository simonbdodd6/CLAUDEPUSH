/**
 * Coach Products — Weekly Brief Types (M18)
 *
 * Constants for the Weekly Brief product.
 * Imported by both weekly-brief.js and its tests.
 * No Brain imports — pure constants.
 */

/** Product identity. Version 2.0 — presentation layer above M16 v1 API product. */
export const BRIEF_ID      = 'weekly-brief'
export const BRIEF_VERSION = '2.0'

/** Urgency levels on individual attention items and priorities. */
export const URGENCY = Object.freeze({
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
})

/** Training load status categories. */
export const LOAD_STATUS = Object.freeze({
  ON_TRACK: 'on_track',
  BEHIND:   'behind',
  AT_RISK:  'at_risk',
  UNKNOWN:  'unknown',
})

/**
 * All top-level fields in a WeeklyBriefResponse.
 * Useful for Core to iterate over fields defensively.
 */
export const BRIEF_FIELD = Object.freeze({
  TOP_PRIORITIES:            'topPriorities',
  BIGGEST_RISKS:             'biggestRisks',
  ATTENDANCE_SUMMARY:        'attendanceSummary',
  AVAILABILITY_SUMMARY:      'availabilitySummary',
  TRAINING_LOAD_SUMMARY:     'trainingLoadSummary',
  MATCH_PREPARATION_STATUS:  'matchPreparationStatus',
  PLAYERS_NEEDING_ATTENTION: 'playersNeedingAttention',
  RECOMMENDED_ACTIONS:       'recommendedActions',
})

/**
 * Threshold for training load status derivation.
 * completionPct = estimatedMinutes / (total * TARGET_MINUTES_PER_ACTION) * 100
 */
export const LOAD_TARGET_MINUTES_PER_ACTION = 30
export const LOAD_ON_TRACK_THRESHOLD        = 80   // ≥80% → on_track
export const LOAD_BEHIND_THRESHOLD          = 60   // 60–79% → behind; <60 → at_risk
