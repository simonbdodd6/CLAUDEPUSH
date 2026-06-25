/**
 * @brain-decision-planner — End-to-End Brain Dry Run Harness (DORMANT, verification-only)
 *
 * Runs the complete dormant Brain stack from two validated read-only providers through the proven
 * squad pipeline and returns a structured dry-run result for engineering verification:
 *
 *   { squadLoader, decisionPlanSource }
 *   → runBoundarySquadCapstone (M172)   → { brainInputs (M170), candidates, formation, squad }
 *   → summarizeBrainInputs (M171)        → summary
 *   → verification                       → deterministic counts of what was present
 *
 * NOT production wiring, runtime activation, Core integration, AI, or live recommendation. Thin
 * composition over M170–M172: it adds no coaching conclusions, changes no squad/recommendation logic,
 * and produces no user-facing output. No networking, persistence, feature flags, live providers,
 * timestamps, clock or randomness. Providers/inputs are never mutated; the result is deeply frozen.
 *
 * The coach-intelligence engines stay INJECTED via options.pipelineServices (passed through to M172) —
 * never imported here — preserving the existing decoupling.
 */

import { runBoundarySquadCapstone } from './boundary-squad-capstone-harness.js'
import { summarizeBrainInputs } from './brain-inputs-summary.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Count the filled starters in an M130 squad (vacant jerseys are not "present" players). */
function countFilledStarters(squad) {
  return Array.isArray(squad.startingXV)
    ? squad.startingXV.filter((s) => isObj(s) && s.status === 'filled').length
    : 0
}

/**
 * Run the full Brain dry run and return a structured, frozen verification result.
 *
 * @param {{ squadLoader: object, decisionPlanSource: object }} input
 * @param {{ pipelineServices: object, confidenceProvider?: object, squadOptions?: object }} [options]
 *   passed through to M172 — pipelineServices are the injected coach-intelligence engines
 * @returns {Readonly<{ brainInputs: object, summary: object, capstone: object, verification: object }>}
 */
export function runBrainDryRun(input, options = {}) {
  if (!isObj(options)) throw new TypeError('runBrainDryRun: options must be an object')

  // M172 validates both providers + services, runs buildBrainInputs (M170) internally, and builds the squad
  const capstone = runBoundarySquadCapstone(input, options)
  const brainInputs = capstone.brainInputs        // == buildBrainInputs(input) (M170), via M172
  const summary = summarizeBrainInputs(brainInputs) // M171
  const squad = capstone.squad

  const verification = {
    hasSquadInput: summary.hasSquadInput,
    hasDecisionInput: summary.hasDecisionInput,
    hasSquad: isObj(squad),
    startingCount: isObj(squad) ? countFilledStarters(squad) : 0,
    benchCount: isObj(squad) && Array.isArray(squad.bench) ? squad.bench.length : 0,
    reserveCount: isObj(squad) && Array.isArray(squad.reserves) ? squad.reserves.length : 0,
    warningCount: isObj(squad) && isObj(squad.risk) && Array.isArray(squad.risk.risks) ? squad.risk.risks.length : 0,
  }

  return deepFreeze({ brainInputs, summary, capstone, verification })
}
