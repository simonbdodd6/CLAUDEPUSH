/**
 * @brain/recommendation-validation — error model + canonical codes (M49)
 *
 * Pure, deterministic. Malformed INPUT throws; per-field invalidity is REPORTED as
 * `reasons` on a frozen result (never thrown). No I/O.
 */

export const REC_VALIDATION_ERROR = Object.freeze({
  INVALID_INPUT: 'invalid_input',     // structurally unusable input (non-object rec, missing store, …)
})

/** Canonical, stable failure reasons reported on an invalid recommendation. */
export const REC_REASON = Object.freeze({
  INVALID_ID:             'invalid_id',
  INVALID_TENANT:         'invalid_tenant',
  EMPTY_EVIDENCE:         'empty_evidence',
  INVALID_EVIDENCE:       'invalid_evidence',
  MISSING_EVIDENCE:       'missing_evidence',
  DUPLICATE_EVIDENCE:     'duplicate_evidence',
  CROSS_TENANT_EVIDENCE:  'cross_tenant_evidence',
  INVALID_CONFIDENCE:     'invalid_confidence',
  DUPLICATE_RECOMMENDATION: 'duplicate_recommendation',
})

/** Confidence status bands. */
export const CONFIDENCE_STATUS = Object.freeze({
  HIGH:         'high',         // >= 0.75
  MEDIUM:       'medium',       // >= 0.50
  LOW:          'low',          // > 0
  INSUFFICIENT: 'insufficient', // == 0 (a valid score, but no confidence)
  INVALID:      'invalid',      // not a finite number in [0,1]
})

export class RecommendationValidationError extends Error {
  /** @param {string} code @param {string} [message] */
  constructor(code, message) {
    super(message ?? code)
    this.name = 'RecommendationValidationError'
    this.code = code
  }
}
