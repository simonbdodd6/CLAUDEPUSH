/**
 * @brain-decision-planner — Boundary → Squad Capstone Harness (DORMANT, proof-only)
 *
 * Proves the read-only Brain boundary stack composes from validated providers into the proven
 * squad pipeline path:
 *
 *   { squadLoader, decisionPlanSource }
 *   → buildBrainInputs (M170)            → { squadInput, decisionInput }
 *   → assembleCandidates (M132) + resolveFormationFromCandidates (M133)   (from squadInput)
 *   → runPipelineBridge (M137) → M118 → M119 → M131                       (decisionInput as plan/decision)
 *   → match-day squad
 *
 * Dormant/proof-only: no runtime wiring, feature flags, UI, networking, persistence, database, AI
 * calls, recommendations, Date.now or Math.random. It reuses existing functions only and invents no
 * selection logic. Providers/inputs are never mutated; the returned object is deeply frozen.
 *
 * The coach-intelligence engines (M118/M119/M131) are INJECTED via options.pipelineServices — the
 * adapter never imports them — preserving the existing injection-based decoupling.
 */

import { buildBrainInputs } from './brain-inputs-facade.js'
import {
  assembleCandidates, resolveFormationFromCandidates, inMemoryCoachMemoryAdapter,
  assembleIntelligenceServices, constantConfidenceProvider, runPipelineBridge,
} from '../coach-core-adapter/index.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/**
 * Compose two validated read-only providers into a complete match-day squad output.
 *
 * @param {{ squadLoader: object, decisionPlanSource: object }} input
 * @param {{ pipelineServices: object, confidenceProvider?: object, squadOptions?: object }} [options]
 *   pipelineServices  — the injected coach-intelligence engines { runCoachIntelligencePipeline, buildCoachRecommendation, runSelectionPipeline }
 *   confidenceProvider — defaults to constantConfidenceProvider(0.6)
 *   squadOptions       — defaults to { limit: 30 }
 * @returns {Readonly<{ brainInputs: object, candidates: object[], formation: object, squad: object }>}
 */
export function runBoundarySquadCapstone(input, options = {}) {
  if (!isObj(options)) throw new TypeError('runBoundarySquadCapstone: options must be an object')

  // read boundaries (M170 validates both providers internally: squad then decision)
  const brainInputs = buildBrainInputs(input)
  const { squadInput, decisionInput } = brainInputs

  // squadInput → candidates (M132) + formation (M133)
  const confidenceProvider = options.confidenceProvider !== undefined ? options.confidenceProvider : constantConfidenceProvider(0.6)
  const records = squadInput.players.map((p) => ({ player: { userId: p.userId, position: p.position }, availabilityResponse: squadInput.availability[p.userId] }))
  const candidates = assembleCandidates(records, confidenceProvider)
  const formation = resolveFormationFromCandidates(candidates).formation

  // decisionInput → M118-ready plan/decision; provide the memory store + real M110–M117 services
  const memoryProvider = inMemoryCoachMemoryAdapter(squadInput.memories)
  const intelligenceServices = assembleIntelligenceServices(memoryProvider)

  // proven pipeline bridge (M137) with INJECTED engines → match-day squad
  const bridge = runPipelineBridge({
    candidates,
    formation,
    positionGroups: {},
    plan: decisionInput.plan,
    decision: decisionInput.decision,
    memoryProvider,
    intelligenceServices,
    squadOptions: options.squadOptions !== undefined ? options.squadOptions : { limit: 30 },
  }, options.pipelineServices)

  return deepFreeze({ brainInputs, candidates, formation, squad: bridge.result })
}
