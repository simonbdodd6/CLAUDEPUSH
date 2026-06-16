/**
 * @brain/evidence-weighting (M47)
 *
 * The dormant, pure deterministic confidence-weighting library for the AI Brain's
 * inbound (evidence) half, per the M42 §6 model: source trust · recency ·
 * corroboration · conflict · volume saturation.
 *
 * Pure functions only — no side effects, no storage, no network, no files, no
 * clock, no randomness; everything is caller-supplied and returns are immutable.
 * No recommendation generation, no reasoning, no prediction — weighting maths only.
 * Depends solely on @brain/evidence-contracts. Imported by nobody yet (dormant).
 */

export {
  DEFAULT_WEIGHTS,
  applyRecencyWeight,
  applyCorroborationBoost,
  applyConflictPenalty,
  applyVolumeSaturation,
  calculateEvidenceConfidence,
  combineEvidenceConfidence,
} from './weighting.js'
export { WeightingError, WEIGHTING_ERROR } from './errors.js'
