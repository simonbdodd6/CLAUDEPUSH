/**
 * @coach-memory — Coach decision alignment engine (M116, DORMANT)
 *
 * Measures how strongly a coaching decision aligns with an M114 Coach DNA Profile. This is
 * NOT a recommendation and generates no language — it deterministically scores alignment
 * from evidence the inputs already carry, so future recommendation engines can gate advice.
 *
 * alignmentScore = clamp01(
 *     (matchedDominantSignal ? signalStrength : 0) * 0.5     // dominant signal contribution
 *   + decision.confidence * 0.3                              // decision confidence
 *   + min(matchedSignals.length, 5) / 5 * 0.2                // matched signal contribution
 * )
 *
 * Pure and side-effect free: no persistence, retrieval, storage, vector search, LLM,
 * randomness or clock. Inputs are never mutated; output is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object'
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

/** Validate the M114 profile (the fields this engine reads). */
function assertProfile(profile) {
  if (!isObj(profile) || Array.isArray(profile) || typeof profile.profileVersion !== 'string' ||
      !Array.isArray(profile.dominantSignals)) {
    throw new TypeError('scoreDecisionAlignment requires an M114 Coach DNA profile')
  }
}

/** Validate the decision shape. */
function assertDecision(decision) {
  if (!isObj(decision) || Array.isArray(decision) ||
      typeof decision.category !== 'string' ||
      !isFiniteNumber(decision.confidence) ||
      !isStringArray(decision.matchedSignals)) {
    throw new TypeError('scoreDecisionAlignment requires a decision { category, confidence, matchedSignals }')
  }
}

/** Map an alignmentScore to its tier. */
function tierOf(score) {
  if (score >= 0.90) return 'excellent'
  if (score >= 0.75) return 'good'
  if (score >= 0.55) return 'neutral'
  if (score >= 0.30) return 'weak'
  return 'poor'
}

/**
 * Score how strongly a decision aligns with the Coach DNA profile.
 *
 * @param {object} profile  the M114 Coach DNA Profile
 * @param {{ category:string, confidence:number, matchedSignals:string[] }} decision
 * @returns {Readonly<{ alignmentScore:number, alignmentTier:string, matchedDominantSignal:boolean,
 *   signalStrength:number, reasons:ReadonlyArray<string>,
 *   metadata: Readonly<{ deterministic:true, explainable:true, llmGenerated:false }> }>}
 */
export function scoreDecisionAlignment(profile, decision) {
  assertProfile(profile)
  assertDecision(decision)

  const matchEntry = profile.dominantSignals.find((s) => isObj(s) && s.category === decision.category)
  const matchedDominantSignal = matchEntry !== undefined
  const signalStrength = (matchedDominantSignal && isFiniteNumber(matchEntry.strength)) ? matchEntry.strength : 0

  const dominantContribution = (matchedDominantSignal ? signalStrength : 0) * 0.5
  const confidenceContribution = decision.confidence * 0.3
  const matchedContribution = Math.min(decision.matchedSignals.length, 5) / 5 * 0.2
  const alignmentScore = clamp01(dominantContribution + confidenceContribution + matchedContribution)

  const reasons = []
  reasons.push(matchedDominantSignal
    ? 'Decision matches dominant coaching category.'
    : 'Decision does not match dominant coaching category.')
  if (decision.confidence > 0) reasons.push('Decision confidence contributes positively.')
  if (decision.matchedSignals.length > 0) reasons.push('Matched coaching signals.')

  return deepFreeze({
    alignmentScore,
    alignmentTier: tierOf(alignmentScore),
    matchedDominantSignal,
    signalStrength,
    reasons,
    metadata: { deterministic: true, explainable: true, llmGenerated: false },
  })
}
