/**
 * AI Brain — Policy Types (M12)
 *
 * Shared constants for the Brain Safety & Policy Guard layer.
 * Imported by policy-rules.js, policy-engine.js, and tests.
 */

export const POLICY_SCHEMA_VERSION = '1.0'

export const POLICY_STATUS = Object.freeze({
  ALLOWED:      'allowed',
  NEEDS_REVIEW: 'needs_review',
  BLOCKED:      'blocked',
})

export const RULE_ID = Object.freeze({
  SELECTION_CHANGE:  'SELECTION_CHANGE',
  AUTO_MESSAGING:    'AUTO_MESSAGING',
  MEDICAL_ACTION:    'MEDICAL_ACTION',
  DISCIPLINE_ACTION: 'DISCIPLINE_ACTION',
  PRIVATE_DATA:      'PRIVATE_DATA',
  CROSS_CLUB_DATA:   'CROSS_CLUB_DATA',
  MISSING_EVIDENCE:  'MISSING_EVIDENCE',
  HIGH_IMPACT:       'HIGH_IMPACT',
})

// Severity ranking used to compute the worst-case status across all rules.
export const STATUS_RANK = Object.freeze({
  [POLICY_STATUS.ALLOWED]:      0,
  [POLICY_STATUS.NEEDS_REVIEW]: 1,
  [POLICY_STATUS.BLOCKED]:      2,
})
