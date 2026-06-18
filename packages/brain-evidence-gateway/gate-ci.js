/**
 * @brain/evidence-gateway — one-call CI entry point / gateCI (M76, DORMANT)
 *
 * Executes the complete dormant verification pipeline in a single call and returns one
 * frozen { envelope, outcome, decision }. Pure ORCHESTRATION over existing milestones —
 * it adds no resolve / check / report / outcome / policy / decision logic of its own:
 *
 *   runExpectationGate (M71 = resolve M70 → suite M68 → report M69) → envelope
 *           → emitGateOutcome (M72)                                  → outcome
 *           → decideGate (M75, which evaluates the M74 policy)       → decision
 *
 * Reads only — no store, engine, persistence, filesystem, API, network, clock or
 * randomness. Inputs are never mutated; every returned part is already deeply frozen by
 * the helper that produced it, and the wrapper is frozen too.
 */

import { runExpectationGate } from './run-gate.js'
import { emitGateOutcome } from './emit-gate.js'
import { decideGate } from './decide-gate.js'

/**
 * Run the whole dormant gate pipeline end-to-end.
 *
 * @param {object} expectationSet  an expectation set from `createExpectationSet` (M70)
 * @param {(Record<string, object>|Array<{ name:string, planOrSnapshot:object }>)} [runs]
 * @param {{
 *   allowlist?: (string[]|{paths?:string[],stages?:string[]}),
 *   maxEntriesPerCase?: number,
 *   policy?: object,
 *   decisionFormat?: ('line'|'full')
 * }} [options]
 *   allowlist          — suite-level default tolerance (M68, via M71)
 *   maxEntriesPerCase  — per-case report sample cap (M69, via M71)
 *   policy             — release policy (M74, via M75)
 *   decisionFormat     — decision line format (M75): "line" (default) | "full"
 * @returns {Readonly<{ envelope: object, outcome: object, decision: object }>}
 */
export function gateCI(expectationSet, runs = {}, options = {}) {
  const { allowlist, maxEntriesPerCase, policy, decisionFormat } = options || {}

  const envelope = runExpectationGate(expectationSet, runs, { allowlist, maxEntriesPerCase })  // M71
  const outcome = emitGateOutcome(envelope)                                                    // M72
  const decision = decideGate(outcome, policy, { format: decisionFormat })                     // M75 (+ M74)

  return Object.freeze({ envelope, outcome, decision })
}
