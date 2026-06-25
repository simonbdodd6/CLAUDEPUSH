/**
 * @brain-decision-planner — Intelligence Boundary Harness (DORMANT, orchestration-only)
 *
 * Proves the decision-planning boundary composes end-to-end:
 *   provider → M167 validate + M168 mapDecisionPlanContext → M135 buildDecisionPlanContext
 *            → M140 completeIntelligenceInput → completed intelligence input.
 *
 * Pure deterministic orchestration ONLY — no AI, recommendations, feature flags, runtime wiring,
 * networking, persistence, or Core imports. It mutates nothing; the returned object is whatever
 * M140 produces (already deeply frozen).
 *
 * NOTE: `stages` is an OPTIONAL second argument defaulting to the real M168/M135/M140 functions.
 * The single-argument call `completeDecisionPlanningInput(provider)` runs the real pipeline; the
 * optional argument exists solely to make the required call-order / call-once tests possible.
 */

import { mapDecisionPlanContext } from './decision-plan-context-mapper.js'
import { buildDecisionPlanContext } from '../coach-core-adapter/decision-plan-builder.js'
import { completeIntelligenceInput } from '../coach-core-adapter/intelligence-input-completer.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// real pipeline stages (M168 validates via M167 internally)
const DEFAULT_STAGES = Object.freeze({ mapDecisionPlanContext, buildDecisionPlanContext, completeIntelligenceInput })

/**
 * Run the decision-planning boundary pipeline and return the completed M140 intelligence input.
 *
 * @param {{ getFixtureContext: Function, getCoachIdentity: Function }} provider  an M167-shaped provider
 * @param {{ mapDecisionPlanContext: Function, buildDecisionPlanContext: Function, completeIntelligenceInput: Function }} [stages]
 *   defaults to the real M168 / M135 / M140 — injectable only for testing call order / call-once
 * @returns {object}  the completed { plan, decision, metadata } intelligence input (M140)
 */
export function completeDecisionPlanningInput(provider, stages = DEFAULT_STAGES) {
  if (!isObj(stages) || typeof stages.mapDecisionPlanContext !== 'function' ||
      typeof stages.buildDecisionPlanContext !== 'function' || typeof stages.completeIntelligenceInput !== 'function') {
    throw new TypeError('completeDecisionPlanningInput: stages must provide mapDecisionPlanContext, buildDecisionPlanContext, completeIntelligenceInput')
  }

  const context = stages.mapDecisionPlanContext(provider)        // M167 validate + M168 map → { fixture, match, coachContext }
  const decisionPlanContext = stages.buildDecisionPlanContext(context)   // M135 → { plan(request), decision, metadata }
  return stages.completeIntelligenceInput(decisionPlanContext)   // M140 → { plan(normalized), decision(+supportingMemoryIds), metadata }
}
