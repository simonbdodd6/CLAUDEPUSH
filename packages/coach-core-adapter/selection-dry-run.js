/**
 * @coach-core-adapter — Adapter → Selection Pipeline Dry Run (DORMANT, HARNESS)
 *
 * Proves the adapter layer can feed the Coach Intelligence selection pipeline end-to-end. It
 * composes M134 `buildSelectionContext` (selection side) and M135 `buildDecisionPlanContext`
 * (intelligence side) into the pipeline input contract, then invokes an INJECTED
 * `runSelectionPipeline` service exactly once. It implements no selection logic, runs no
 * intelligence, generates no text, and loads no live data.
 *
 * Pure and deterministic: no Core, Redis, network, filesystem, APIs, LLM, clock or randomness.
 * Inputs and injected services are never mutated.
 */

import { buildSelectionContext } from './selection-context-builder.js'
import { buildDecisionPlanContext } from './decision-plan-builder.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Run an end-to-end dry run from Core-shaped input through the injected selection pipeline.
 *
 * @param {{
 *   players: object[], availabilityResponses: object, confidenceProvider: object,
 *   fixture?: object, match?: object, coachContext?: object, selectionOptions?: object
 * }} input
 * @param {{
 *   runSelectionPipeline: (pipelineInput: object) => any,
 *   memoryProvider: object, intelligenceServices: object
 * }} services
 * @returns {Readonly<{ selectionContext: object, decisionPlanContext: object, pipelineInput: object, result: any, metadata: object }>}
 */
export function runSelectionDryRun(input, services) {
  if (!isObj(input)) throw new TypeError('runSelectionDryRun requires an input object')
  if (!isObj(services)) throw new TypeError('runSelectionDryRun requires a services object')
  if (typeof services.runSelectionPipeline !== 'function') throw new TypeError('runSelectionDryRun: services.runSelectionPipeline must be a function')
  if (!isObj(services.memoryProvider)) throw new TypeError('runSelectionDryRun: services.memoryProvider must be an object')
  if (!isObj(services.intelligenceServices)) throw new TypeError('runSelectionDryRun: services.intelligenceServices must be an object')

  // selection side (M134) — validates players / availability / confidence provider / options
  const selectionContext = buildSelectionContext({
    players: input.players,
    availabilityResponses: input.availabilityResponses,
    confidenceProvider: input.confidenceProvider,
    options: input.selectionOptions,
  })

  // intelligence side (M135) — validates fixture / match / coach context
  const decisionPlanContext = buildDecisionPlanContext({
    fixture: input.fixture,
    match: input.match,
    coachContext: input.coachContext,
  })

  // assemble the pipeline input contract (data parts already frozen by M134/M135)
  const pipelineInput = {
    candidates: selectionContext.candidates,
    formation: selectionContext.formation,
    positionGroups: selectionContext.positionGroups,
    plan: decisionPlanContext.plan,
    decision: decisionPlanContext.decision,
    memoryProvider: services.memoryProvider,
    intelligenceServices: services.intelligenceServices,
  }

  const result = services.runSelectionPipeline(pipelineInput)   // injected; called exactly once; exceptions propagate

  const metadata = {
    deterministic: true,
    adapterLayer: true,
    dryRun: true,
    playerCount: selectionContext.metadata.playerCount,
    candidateCount: selectionContext.metadata.candidateCount,
    unresolvedCount: selectionContext.metadata.unresolvedCount,
  }

  // freeze the adapter-produced structure only — never the injected services or pipeline result
  Object.freeze(pipelineInput)
  Object.freeze(metadata)
  return Object.freeze({ selectionContext, decisionPlanContext, pipelineInput, result, metadata })
}
