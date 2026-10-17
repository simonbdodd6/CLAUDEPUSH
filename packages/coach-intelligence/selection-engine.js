/**
 * @coach-intelligence — Selection Recommendation Engine (M120, DORMANT)
 *
 * The first genuine coaching-intelligence engine: it evaluates a single candidate player by
 * consuming the M118 pipeline result and the M119 recommendation. It does NOT select a team
 * and generates no language — it emits deterministic per-candidate recommendation metadata.
 *
 * score = clamp01(
 *     recommendation.confidence * 0.4
 *   + candidate.confidence * 0.3
 *   + pipelineResult.alignment.alignmentScore * 0.3
 * )
 *
 * `eligible` is the availability gate (false when unavailable); the score is computed from
 * the confidence formula independently of availability. Pure and side-effect free: no
 * storage, retrieval, persistence, generated text, randomness or clock. Inputs are never
 * mutated; output is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object'
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const isUnitNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
const clamp01 = (x) => Math.min(1, Math.max(0, x))

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function assertCandidate(c) {
  if (!isObj(c) || Array.isArray(c) || !isNonEmptyString(c.playerId) || !isNonEmptyString(c.position) ||
      typeof c.availability !== 'boolean' || !isUnitNumber(c.confidence)) {
    throw new TypeError('evaluateSelectionCandidate requires a candidate { playerId, position, availability, confidence }')
  }
}

function assertPipelineResult(r) {
  if (!isObj(r) || Array.isArray(r) || !isObj(r.alignment) || !isFiniteNumber(r.alignment.alignmentScore)) {
    throw new TypeError('evaluateSelectionCandidate: malformed pipeline result')
  }
}

function assertRecommendation(rec) {
  if (!isObj(rec) || Array.isArray(rec) || !isFiniteNumber(rec.confidence) || typeof rec.action !== 'string' ||
      typeof rec.requiresCoachReview !== 'boolean' || typeof rec.alignmentTier !== 'string' ||
      !isObj(rec.evidence) || typeof rec.evidence.challenged !== 'boolean' ||
      !isStringArray(rec.evidence.dominantSignals) || !isStringArray(rec.evidence.matchedSignals)) {
    throw new TypeError('evaluateSelectionCandidate: malformed recommendation')
  }
}

/**
 * Evaluate a single selection candidate against the pipeline + recommendation.
 *
 * @param {{ playerId:string, position:string, availability:boolean, confidence:number }} candidate
 * @param {object} pipelineResult  an M118 pipeline result
 * @param {object} recommendation  an M119 recommendation
 * @returns {Readonly<{ eligible:boolean, score:number, recommendationAction:string, requiresCoachReview:boolean,
 *   evidence: Readonly<{ alignmentTier:string, challenged:boolean, dominantSignals:ReadonlyArray<string>, matchedSignals:ReadonlyArray<string> }>,
 *   metadata: Readonly<{ deterministic:true, explainable:true, llmGenerated:false }> }>}
 */
export function evaluateSelectionCandidate(candidate, pipelineResult, recommendation) {
  assertCandidate(candidate)
  assertPipelineResult(pipelineResult)
  assertRecommendation(recommendation)

  const eligible = candidate.availability === true

  const score = clamp01(
    recommendation.confidence * 0.4
    + candidate.confidence * 0.3
    + pipelineResult.alignment.alignmentScore * 0.3,
  )

  return deepFreeze({
    eligible,
    score,
    recommendationAction: recommendation.action,
    requiresCoachReview: recommendation.requiresCoachReview,
    evidence: {
      alignmentTier: recommendation.alignmentTier,
      challenged: recommendation.evidence.challenged,
      dominantSignals: recommendation.evidence.dominantSignals.slice(),
      matchedSignals: recommendation.evidence.matchedSignals.slice(),
    },
    metadata: { deterministic: true, explainable: true, llmGenerated: false },
  })
}
