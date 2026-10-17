/**
 * @coach-intelligence — Coach Intelligence Pipeline (M118, DORMANT)
 *
 * The first orchestration layer. It creates NO new intelligence — it composes the
 * already-built intelligence (M110 retrieve → M112 synthesize → M113 DNA signals →
 * M114 DNA profile → M115 explanation → M116 alignment → M117 challenge) into one
 * deterministic entry point for future recommendation engines.
 *
 * Every capability is dependency-injected via `services` (interfaces, not implementations) —
 * the pipeline imports none of them. It validates the services and each stage's output,
 * never mutates its inputs, and deep-freezes the final result. No LLM, storage, persistence,
 * orchestration framework, randomness or clock — pure composition.
 */

const isObj = (v) => v !== null && typeof v === 'object'

const REQUIRED_SERVICES = Object.freeze([
  'retrieveCoachMemories',   // (plan, provider) -> memories   [M110]
  'synthesizeCoachMemories', // (memories) -> synthesis        [M112]
  'extractCoachDnaSignals',  // (memories) -> signals          [M113]
  'buildCoachDnaProfile',    // (signals) -> profile           [M114]
  'buildDecisionExplanation', // (profile, decision) -> explanation  [M115]
  'scoreDecisionAlignment',  // (profile, decision) -> alignment     [M116]
  'buildDecisionChallenge',  // (profile, decision, alignment) -> challenge [M117]
])

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function assertInput(input) {
  if (!isObj(input) || Array.isArray(input) || !isObj(input.plan) || !isObj(input.decision)) {
    throw new TypeError('runCoachIntelligencePipeline requires input { plan, decision }')
  }
}

function assertServices(services) {
  if (!isObj(services) || Array.isArray(services)) throw new TypeError('runCoachIntelligencePipeline requires a services object')
  for (const name of REQUIRED_SERVICES) {
    if (typeof services[name] !== 'function') throw new TypeError(`runCoachIntelligencePipeline: malformed service "${name}" (must be a function)`)
  }
  if (!isObj(services.memoryProvider)) throw new TypeError('runCoachIntelligencePipeline: malformed service "memoryProvider"')
}

/** Validate a stage output's type (array or object), else throw. */
function assertStage(name, value, kind) {
  const ok = kind === 'array' ? Array.isArray(value) : (isObj(value) && !Array.isArray(value))
  if (!ok) throw new TypeError(`runCoachIntelligencePipeline: stage "${name}" produced a malformed output`)
  return value
}

/**
 * Run the deterministic Coach Intelligence pipeline.
 *
 * @param {{ plan:object, decision:object }} input
 * @param {{ memoryProvider:object, retrieveCoachMemories:Function, synthesizeCoachMemories:Function,
 *           extractCoachDnaSignals:Function, buildCoachDnaProfile:Function, buildDecisionExplanation:Function,
 *           scoreDecisionAlignment:Function, buildDecisionChallenge:Function }} services
 * @returns {Readonly<{ memories:object[], synthesis:object, signals:object, profile:object,
 *   explanation:object, alignment:object, challenge:object }>}
 */
export function runCoachIntelligencePipeline(input, services) {
  assertInput(input)
  assertServices(services)

  const { plan, decision } = input

  const memories = assertStage('retrieve', services.retrieveCoachMemories(plan, services.memoryProvider), 'array')
  const synthesis = assertStage('synthesize', services.synthesizeCoachMemories(memories), 'object')
  const signals = assertStage('signals', services.extractCoachDnaSignals(memories), 'object')
  const profile = assertStage('profile', services.buildCoachDnaProfile(signals), 'object')
  const explanation = assertStage('explanation', services.buildDecisionExplanation(profile, decision), 'object')
  const alignment = assertStage('alignment', services.scoreDecisionAlignment(profile, decision), 'object')
  const challenge = assertStage('challenge', services.buildDecisionChallenge(profile, decision, alignment), 'object')

  return deepFreeze({ memories, synthesis, signals, profile, explanation, alignment, challenge })
}
