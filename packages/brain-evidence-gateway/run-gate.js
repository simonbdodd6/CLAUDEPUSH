/**
 * @brain/evidence-gateway — end-to-end expectation gate / runExpectationGate (M71, DORMANT)
 *
 * A pure one-call orchestration of the dormant regression-gate chain: it resolves a named
 * expectation set against fresh runs (M70 `resolveExpectationSet`), runs the multi-case
 * suite gate (M68 `checkPipelineSuite`), and formats the human-readable report
 * (M69 `formatPipelineSuiteReport`) — returning one frozen `{ cases, verdict, report }`
 * envelope.
 *
 * It is ORCHESTRATION ONLY: every step delegates to an existing helper (no new resolve /
 * check / diff / format logic), so all validation, deterministic ordering, suite-allowlist
 * behaviour, and report truncation come straight from those layers. It only READS its
 * inputs — no store, engine, persistence, API, UI, network, no clock, no randomness.
 * Inputs are never mutated; the envelope is frozen (its parts are already frozen by the
 * helpers that produced them).
 */

import { resolveExpectationSet } from './expectation-set.js'
import { checkPipelineSuite } from './check-suite.js'
import { formatPipelineSuiteReport } from './check-report.js'

/**
 * Resolve → check → report in one deterministic, dormant call.
 *
 * @param {object} expectationSet  an expectation set from `createExpectationSet` (M70)
 * @param {(Record<string, object>|Array<{ name:string, planOrSnapshot:object }>)} [runs]
 *   fresh runs, keyed by name or as an array of named runs (validated by M70)
 * @param {{ allowlist?: (string[]|{paths?:string[],stages?:string[]}), maxEntriesPerCase?: number }} [options]
 *   allowlist          — suite-level default tolerance, passed to `checkPipelineSuite` (M68)
 *   maxEntriesPerCase  — per-case violation-path sample cap, passed to `formatPipelineSuiteReport` (M69)
 * @returns {Readonly<{ cases: ReadonlyArray<object>, verdict: object, report: object }>}
 */
export function runExpectationGate(expectationSet, runs = {}, options = {}) {
  const { allowlist, maxEntriesPerCase } = options || {}

  const cases = resolveExpectationSet(expectationSet, runs)                 // M70
  const verdict = checkPipelineSuite(cases, { allowlist })                  // M68
  const report = formatPipelineSuiteReport(verdict, { maxEntriesPerCase })  // M69

  return Object.freeze({ cases, verdict, report })
}
