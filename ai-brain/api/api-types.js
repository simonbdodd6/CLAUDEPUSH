/**
 * AI Brain — Coach Experience API Types (M15)
 *
 * Constants, schema versions, feature flags, and status codes
 * shared across all ai-brain/api/* modules.
 *
 * Core consumes these constants to version-gate API responses.
 * Never import Brain internals here.
 */

/** Current API version. Bump to 'v2' on any breaking shape change. */
export const API_VERSION = 'v1'

/** Response status codes returned in every ApiResponse envelope. */
export const API_STATUS = Object.freeze({
  OK:       'ok',
  ERROR:    'error',
  DISABLED: 'disabled',
})

/**
 * Feature flags — one per API endpoint.
 *
 * Core passes { flags: { [FLAG]: false } } in opts to disable an endpoint.
 * All flags default to enabled if not explicitly set.
 *
 * Usage:
 *   const result = await AI.getDashboard(coachId, clubId, {
 *     flags: { [FEATURE_FLAG.DASHBOARD]: false }
 *   })
 */
export const FEATURE_FLAG = Object.freeze({
  DASHBOARD:      'ai.dashboard',
  PLAYER_INSIGHT: 'ai.playerInsight',
  TEAM_INSIGHT:   'ai.teamInsight',
  CLUB_INSIGHT:   'ai.clubInsight',
})

/**
 * Error codes for ApiResponse.error.code.
 * Core can switch on these without parsing error messages.
 */
export const API_ERROR = Object.freeze({
  DISABLED:          'FEATURE_DISABLED',
  INVALID_INPUT:     'INVALID_INPUT',
  BRAIN_UNAVAILABLE: 'BRAIN_UNAVAILABLE',
  INTERNAL:          'INTERNAL_ERROR',
})

/** Priority weight used for ranking recommendations. Higher = more urgent. */
export const PRIORITY_RANK = Object.freeze({
  HIGH:   3,
  MEDIUM: 2,
  LOW:    1,
})

/** Maximum items returned in each collection field. */
export const API_LIMITS = Object.freeze({
  TOP_RECOMMENDATIONS:   5,
  PLANNING_CHECKLIST:    10,
  OBSERVATIONS:          5,
  POLICY_WARNINGS:       5,
  EXPLANATION_SUMMARIES: 3,
  TRENDS:                5,
  RECENT_EVENTS:         5,
})
