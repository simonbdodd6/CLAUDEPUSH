/**
 * AI Brain — Coach Intelligence Product Types (M16)
 *
 * Shared constants for the products layer.
 * Products sit above the Coach Experience API (M15) and compose its outputs
 * into complete coaching deliverables.
 *
 * Core imports only these constants — never Brain internals.
 */

/** Current product schema version. Bump on any breaking data-shape change. */
export const PRODUCT_VERSION = '1.0'

/** Canonical product identifiers — used in ProductResponse.productId. */
export const PRODUCT_ID = Object.freeze({
  WEEKLY_BRIEF:    'weekly-brief',
  MATCH_READINESS: 'match-readiness',
  PLAYER_CARD:     'player-card',
  CLUB_SNAPSHOT:   'club-snapshot',
})

/**
 * Product-level feature flags.
 * Prefixed with 'ai.product.' to distinguish from api-layer flags ('ai.*').
 * Pass in opts.flags to enable/disable individual products.
 */
export const PRODUCT_FEATURE_FLAG = Object.freeze({
  WEEKLY_BRIEF:    'ai.product.weeklyBrief',
  MATCH_READINESS: 'ai.product.matchReadiness',
  PLAYER_CARD:     'ai.product.playerCard',
  CLUB_SNAPSHOT:   'ai.product.clubSnapshot',
})

export const PRODUCT_ERROR = Object.freeze({
  DISABLED:      'PRODUCT_DISABLED',
  INVALID_INPUT: 'INVALID_INPUT',
  INTERNAL:      'INTERNAL_ERROR',
})

export const RISK_LEVEL = Object.freeze({
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
})

export const TREND = Object.freeze({
  IMPROVING: 'improving',
  STABLE:    'stable',
  DECLINING: 'declining',
  UNKNOWN:   'unknown',
})

export const PRIORITY = Object.freeze({
  HIGH:   'high',
  MEDIUM: 'medium',
  LOW:    'low',
})

/** Engagement score → letter grade thresholds. */
export const GRADE_THRESHOLDS = [
  { min: 80, grade: 'A' },
  { min: 60, grade: 'B' },
  { min: 40, grade: 'C' },
  { min: 20, grade: 'D' },
  { min:  0, grade: 'F' },
]

/** Map a 0-100 score to a letter grade. Returns 'N/A' when score is null. */
export function scoreToGrade(score) {
  if (typeof score !== 'number' || isNaN(score)) return 'N/A'
  for (const { min, grade } of GRADE_THRESHOLDS) {
    if (score >= min) return grade
  }
  return 'F'
}
