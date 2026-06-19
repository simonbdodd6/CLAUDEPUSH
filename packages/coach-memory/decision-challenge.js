/**
 * @coach-memory — Coach decision challenge engine (M117, DORMANT)
 *
 * Determines whether the Brain should actively CHALLENGE a recommendation before it reaches
 * the coach, based on its M116 alignment with the Coach DNA Profile. This is NOT a
 * recommendation and generates no language — it produces structured, deterministic challenge
 * data for future AI/coach review from evidence the inputs already carry.
 *
 * Pure and side-effect free: no persistence, retrieval, storage, LLM, randomness or clock.
 * Inputs are never mutated; output is deeply frozen.
 */

const VALID_TIERS = Object.freeze(['excellent', 'good', 'neutral', 'weak', 'poor'])
const SEVERITY_BY_TIER = Object.freeze({ excellent: 'none', good: 'low', neutral: 'low', weak: 'medium', poor: 'high' })
const HIGH_CONFIDENCE = 0.7

const isObj = (v) => v !== null && typeof v === 'object'
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function assertProfile(profile) {
  if (!isObj(profile) || Array.isArray(profile) || typeof profile.profileVersion !== 'string' || !Array.isArray(profile.dominantSignals)) {
    throw new TypeError('buildDecisionChallenge requires an M114 Coach DNA profile')
  }
}

function assertDecision(decision) {
  if (!isObj(decision) || Array.isArray(decision) || typeof decision.category !== 'string' ||
      !isFiniteNumber(decision.confidence) || !isStringArray(decision.matchedSignals)) {
    throw new TypeError('buildDecisionChallenge requires a decision { category, confidence, matchedSignals }')
  }
}

function assertAlignment(alignment) {
  if (!isObj(alignment) || Array.isArray(alignment) || !VALID_TIERS.includes(alignment.alignmentTier) ||
      typeof alignment.matchedDominantSignal !== 'boolean' || !isFiniteNumber(alignment.alignmentScore)) {
    throw new TypeError('buildDecisionChallenge requires an M116 alignment { alignmentTier, matchedDominantSignal, alignmentScore }')
  }
}

/**
 * Build structured challenge data for a coaching decision.
 *
 * @param {object} profile    the M114 Coach DNA Profile
 * @param {{ category:string, confidence:number, matchedSignals:string[] }} decision
 * @param {object} alignment  the M116 alignment result
 * @returns {Readonly<{ challenged:boolean, severity:string,
 *   divergences:ReadonlyArray<Readonly<{ expected:string, observed:string }>>,
 *   expectedCategories:ReadonlyArray<string>, observedCategory:string, confidence:number,
 *   reasons:ReadonlyArray<string>,
 *   metadata: Readonly<{ deterministic:true, explainable:true, llmGenerated:false, requiresCoachReview:boolean }> }>}
 */
export function buildDecisionChallenge(profile, decision, alignment) {
  assertProfile(profile)
  assertDecision(decision)
  assertAlignment(alignment)

  const tier = alignment.alignmentTier
  const challenged = tier === 'weak' || tier === 'poor'
  const severity = SEVERITY_BY_TIER[tier]

  const expectedCategories = profile.dominantSignals.map((s) => s.category)
  const observedCategory = decision.category
  const matched = alignment.matchedDominantSignal

  // divergences: one { expected, observed } per dominant category the decision did not match
  const divergences = matched ? [] : expectedCategories.map((expected) => ({ expected, observed: observedCategory }))

  const reasons = []
  reasons.push(matched ? 'Decision aligns with established Coach DNA.' : 'Decision differs from dominant coaching category.')
  if (challenged) reasons.push('Low alignment score.')
  if (challenged && !matched && decision.confidence >= HIGH_CONFIDENCE) {
    reasons.push('High-confidence recommendation conflicts with Coach DNA.')
  }

  return deepFreeze({
    challenged,
    severity,
    divergences,
    expectedCategories,
    observedCategory,
    confidence: decision.confidence,   // passed through (M116 alignment carries no confidence field)
    reasons,
    metadata: { deterministic: true, explainable: true, llmGenerated: false, requiresCoachReview: challenged },
  })
}
