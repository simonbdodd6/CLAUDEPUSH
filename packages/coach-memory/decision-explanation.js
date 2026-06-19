/**
 * @coach-memory — Coach decision explanation engine (M115, DORMANT)
 *
 * Assembles a deterministic, explainable record for a coaching decision against an M114
 * Coach DNA Profile. It does NOT generate natural language and invents nothing — it only
 * orders and surfaces the evidence already present in the inputs.
 *
 * Pure and side-effect free: no persistence, retrieval, LLM, generated text, vector search,
 * embeddings, randomness or clock. Inputs are never mutated; output is deeply frozen.
 */

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

/** Validate the M114 profile (the fields this engine reads). */
function assertProfile(profile) {
  if (!isObj(profile) || Array.isArray(profile) || typeof profile.profileVersion !== 'string' ||
      !Array.isArray(profile.dominantSignals)) {
    throw new TypeError('buildDecisionExplanation requires an M114 Coach DNA profile')
  }
}

/** Validate the decision shape. */
function assertDecision(decision) {
  if (!isObj(decision) || Array.isArray(decision) ||
      typeof decision.category !== 'string' ||
      !isFiniteNumber(decision.confidence) ||
      !isStringArray(decision.supportingMemoryIds) ||
      !isStringArray(decision.matchedSignals)) {
    throw new TypeError('buildDecisionExplanation requires a decision { category, confidence, supportingMemoryIds, matchedSignals }')
  }
}

const ascending = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Build an explainable record for a coaching decision against a Coach DNA profile.
 *
 * @param {object} profile   the M114 Coach DNA Profile
 * @param {{ category:string, confidence:number, supportingMemoryIds:string[], matchedSignals:string[] }} decision
 * @returns {Readonly<{
 *   explainable:true,
 *   matchedSignals: ReadonlyArray<string>,
 *   supportingEvidence: ReadonlyArray<string>,
 *   confidence:number,
 *   alignment: Readonly<{ matchedDominantSignal:boolean, profileVersion:string }>,
 *   metadata: Readonly<{ deterministic:true, llmGenerated:false, generatedFromEvidence:true }>
 * }>}
 */
export function buildDecisionExplanation(profile, decision) {
  assertProfile(profile)
  assertDecision(decision)

  // matchedSignals sorted alphabetically
  const matchedSignals = decision.matchedSignals.slice().sort(ascending)

  // supportingEvidence: ids carry no createdAt here, so order by memory id ascending
  const supportingEvidence = decision.supportingMemoryIds.slice().sort(ascending)

  // does the decision's category match one of the profile's dominant signals?
  const matchedDominantSignal = profile.dominantSignals.some((s) => isObj(s) && s.category === decision.category)

  return deepFreeze({
    explainable: true,
    matchedSignals,
    supportingEvidence,
    confidence: decision.confidence,
    alignment: { matchedDominantSignal, profileVersion: profile.profileVersion },
    metadata: { deterministic: true, llmGenerated: false, generatedFromEvidence: true },
  })
}
