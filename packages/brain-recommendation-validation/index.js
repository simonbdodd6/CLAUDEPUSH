/**
 * @brain/recommendation-validation (M49)
 *
 * The dormant deterministic layer proving a recommendation is tenant-scoped,
 * evidence-backed, citation-valid, confidence-scored and non-duplicated — i.e. safe
 * to expose through the façade in a later milestone.
 *
 * Pure + deterministic: no side effects, no storage of its own (reads via an
 * injected @brain/evidence-store), no network, no files, no clock, no randomness;
 * results immutable; caller input never mutated. No recommendation generation,
 * reasoning or prediction. Depends only on the evidence layer. Imported by nobody yet.
 */

export {
  validateRecommendation,
  validateRecommendationSet,
  recommendationEvidenceCoverage,
  missingRecommendationEvidence,
  duplicateRecommendations,
  recommendationConfidenceStatus,
} from './validation.js'
export {
  RecommendationValidationError,
  REC_VALIDATION_ERROR,
  REC_REASON,
  CONFIDENCE_STATUS,
} from './errors.js'
