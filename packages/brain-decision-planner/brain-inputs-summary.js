/**
 * @brain-decision-planner — Brain Inputs Summary (DORMANT, documentation / inspection only)
 *
 * A pure, deterministic summary of what the read-only Brain boundary (M170 buildBrainInputs) can
 * produce — for inspection/docs, without running the live pipeline. It reads the passed
 * { squadInput, decisionInput } object only: it imports nothing, calls no providers, runs no
 * engine/pipeline, derives no recommendations, generates no timestamps/IDs, and mutates nothing.
 * Output is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const arrayLen = (v) => (Array.isArray(v) ? v.length : 0)        // missing array → 0
const keyCount = (v) => (isObj(v) ? Object.keys(v).length : 0)   // missing map → 0
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Summarize an M170 brainInputs `{ squadInput, decisionInput }` into counts and presence flags.
 *
 * @param {{ squadInput?: object, decisionInput?: object }} brainInputs
 * @returns {Readonly<{
 *   hasSquadInput: boolean, hasDecisionInput: boolean,
 *   playerCount: number, availabilityCount: number, memoryCount: number, playerTagCount: number,
 *   hasPlan: boolean, hasDecision: boolean,
 *   decisionCategory: (string|null), confidence: (number|null), supportingMemoryCount: number
 * }>}
 */
export function summarizeBrainInputs(brainInputs) {
  if (!isObj(brainInputs)) throw new TypeError('summarizeBrainInputs requires a { squadInput, decisionInput } object')

  const squad = isObj(brainInputs.squadInput) ? brainInputs.squadInput : null
  const decisionInput = isObj(brainInputs.decisionInput) ? brainInputs.decisionInput : null
  const decision = decisionInput && isObj(decisionInput.decision) ? decisionInput.decision : null

  return deepFreeze({
    hasSquadInput: squad !== null,
    hasDecisionInput: decisionInput !== null,

    playerCount: squad ? arrayLen(squad.players) : 0,
    availabilityCount: squad ? keyCount(squad.availability) : 0,
    memoryCount: squad ? arrayLen(squad.memories) : 0,
    playerTagCount: squad ? keyCount(squad.playerTags) : 0,

    hasPlan: !!(decisionInput && isObj(decisionInput.plan)),
    hasDecision: decision !== null,
    decisionCategory: decision && typeof decision.category === 'string' ? decision.category : null,
    confidence: decision && isFiniteNumber(decision.confidence) ? decision.confidence : null,
    supportingMemoryCount: decision ? arrayLen(decision.supportingMemoryIds) : 0,
  })
}
