/**
 * @coach-intelligence — Coach Recommendation Engine (M119, DORMANT)
 *
 * The first engine that consumes the whole M118 Coach Intelligence Pipeline result and
 * produces a structured, deterministic recommendation. It generates NO natural language and
 * decides NO team selection — it emits recommendation metadata derived from the pipeline's
 * alignment (M116) and challenge (M117) stages.
 *
 * Pure and side-effect free: no persistence, storage, retrieval, LLM, generated text or
 * randomness. The input is never mutated; output is deeply frozen.
 */

const VALID_TIERS = Object.freeze(['excellent', 'good', 'neutral', 'weak', 'poor'])
const isObj = (v) => v !== null && typeof v === 'object'
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the M118 pipeline result (the fields this engine reads). */
function assertPipelineResult(r) {
  if (!isObj(r) || Array.isArray(r)) throw new TypeError('buildCoachRecommendation requires an M118 pipeline result')
  if (!Array.isArray(r.memories) || !isObj(r.profile) || !Array.isArray(r.profile.dominantSignals) ||
      !isObj(r.explanation) || !Array.isArray(r.explanation.matchedSignals)) {
    throw new TypeError('buildCoachRecommendation: malformed pipeline result')
  }
  if (!isObj(r.alignment) || typeof r.alignment.alignmentTier !== 'string' ||
      !VALID_TIERS.includes(r.alignment.alignmentTier) || !isFiniteNumber(r.alignment.alignmentScore)) {
    throw new TypeError('buildCoachRecommendation: malformed alignment')
  }
  if (!isObj(r.challenge) || typeof r.challenge.challenged !== 'boolean') {
    throw new TypeError('buildCoachRecommendation: malformed challenge')
  }
}

/** The challenge's review flag — M117 stores it at challenge.metadata.requiresCoachReview. */
function readRequiresCoachReview(challenge) {
  if (isObj(challenge.metadata) && typeof challenge.metadata.requiresCoachReview === 'boolean') return challenge.metadata.requiresCoachReview
  if (typeof challenge.requiresCoachReview === 'boolean') return challenge.requiresCoachReview
  return challenge.challenged
}

/**
 * Build a deterministic structured recommendation from a pipeline result.
 *
 * @param {object} pipelineResult  an M118 pipeline result
 * @param {object} [policy]        reserved for future gating (currently unused)
 * @returns {Readonly<{ recommend:boolean, action:('present'|'review'|'hold'), confidence:number,
 *   alignmentTier:string, requiresCoachReview:boolean,
 *   evidence: Readonly<{ memoryCount:number, dominantSignals:ReadonlyArray<string>, matchedSignals:ReadonlyArray<string>, challenged:boolean }>,
 *   metadata: Readonly<{ deterministic:true, explainable:true, llmGenerated:false }> }>}
 */
export function buildCoachRecommendation(pipelineResult, policy = {}) {
  assertPipelineResult(pipelineResult)

  const { memories, profile, explanation, alignment, challenge } = pipelineResult

  // action: challenged → review (precedence) ; poor → hold ; otherwise present
  const action = challenge.challenged ? 'review' : (alignment.alignmentTier === 'poor' ? 'hold' : 'present')
  const recommend = action === 'present'

  return deepFreeze({
    recommend,
    action,
    confidence: alignment.alignmentScore,
    alignmentTier: alignment.alignmentTier,
    requiresCoachReview: readRequiresCoachReview(challenge),
    evidence: {
      memoryCount: memories.length,
      dominantSignals: profile.dominantSignals.map((s) => s.category),
      matchedSignals: explanation.matchedSignals.slice(),
      challenged: challenge.challenged,
    },
    metadata: { deterministic: true, explainable: true, llmGenerated: false },
  })
}
