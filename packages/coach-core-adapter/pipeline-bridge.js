/**
 * @coach-core-adapter — Pipeline Bridge (DORMANT, COMPOSITION ONLY)
 *
 * Closes the final wiring gap between the Core adapter package and the existing Coach
 * Intelligence stack. Given the M136 pipeline-input contract, it runs the intelligence side
 * (M118 → M119) and feeds the result into the selection facade (M131), using only INJECTED
 * implementations. It implements no intelligence, recommendation or selection logic of its own,
 * inspects no internals, and generates no text.
 *
 * Pure and deterministic: no Core, Redis, network, filesystem, clock or randomness. Inputs and
 * injected services are never mutated.
 */

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function assertPipelineInput(pi) {
  if (!isObj(pi)) throw new TypeError('runPipelineBridge requires a pipelineInput object')
  if (!Array.isArray(pi.candidates)) throw new TypeError('runPipelineBridge: pipelineInput.candidates must be an array')
  for (const k of ['formation', 'positionGroups', 'plan', 'decision', 'memoryProvider', 'intelligenceServices']) {
    if (!isObj(pi[k])) throw new TypeError(`runPipelineBridge: pipelineInput.${k} must be an object`)
  }
  if (pi.squadOptions !== undefined && !isObj(pi.squadOptions)) throw new TypeError('runPipelineBridge: pipelineInput.squadOptions must be an object')   // optional
}

function assertServices(s) {
  if (!isObj(s)) throw new TypeError('runPipelineBridge requires a services object')
  for (const fn of ['runCoachIntelligencePipeline', 'buildCoachRecommendation', 'runSelectionPipeline']) {
    if (typeof s[fn] !== 'function') throw new TypeError(`runPipelineBridge: services.${fn} must be a function`)
  }
}

/**
 * Bridge M118 → M119 → M131 using injected implementations.
 *
 * @param {{ candidates:object[], formation:object, positionGroups:object, plan:object,
 *   decision:object, memoryProvider:object, intelligenceServices:object, squadOptions?:object }} pipelineInput
 * @param {{ runCoachIntelligencePipeline:Function, buildCoachRecommendation:Function, runSelectionPipeline:Function }} services
 * @returns {Readonly<{ pipelineResult:any, recommendation:any, selectionInput:object, result:any, metadata:object }>}
 */
export function runPipelineBridge(pipelineInput, services) {
  assertPipelineInput(pipelineInput)
  assertServices(services)

  // 1. M118 intelligence pipeline — M118 expects memoryProvider INSIDE its services object
  const pipelineResult = services.runCoachIntelligencePipeline(
    { plan: pipelineInput.plan, decision: pipelineInput.decision },
    { ...pipelineInput.intelligenceServices, memoryProvider: pipelineInput.memoryProvider },
  )

  // 2. M119 recommendation — consumes the M118 result
  const recommendation = services.buildCoachRecommendation(pipelineResult)

  // 3. M131 input contract — candidates/formation/positionGroups from the bridge input,
  //    pipelineResult/recommendation from the intelligence side
  const selectionInput = {
    candidates: pipelineInput.candidates,
    pipelineResult,
    recommendation,
    formation: pipelineInput.formation,
    positionGroups: pipelineInput.positionGroups,
    squadOptions: pipelineInput.squadOptions !== undefined ? pipelineInput.squadOptions : {},   // passthrough to M131→M121
  }

  // 4. M131 selection pipeline — injected; called exactly once; exceptions propagate
  const result = services.runSelectionPipeline(selectionInput)

  const metadata = { deterministic: true, adapterLayer: true, bridge: true }

  // freeze the adapter-produced structure only — never the injected services' returned products
  Object.freeze(selectionInput)
  Object.freeze(metadata)
  return Object.freeze({ pipelineResult, recommendation, selectionInput, result, metadata })
}
