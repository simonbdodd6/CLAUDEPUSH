/**
 * @brain-decision-planner — Multi-Scenario Brain Dry Run Matrix (DORMANT, test/diagnostic-only)
 *
 * Runs the M178 dry-run harness across several fixed in-memory provider scenarios, in input order,
 * and reports per-scenario outcomes — proving the dormant Brain stack stays stable across different
 * input shapes without adding any coaching logic.
 *
 * Thin composition over M178: it adds no recommendations, generates no prose, and produces no
 * user-facing output. No production wiring, Core changes, UI, networking, persistence, feature flags,
 * live providers, AI calls, timestamps, clock or randomness. Scenario inputs are never mutated; the
 * result is deeply frozen. One failing scenario never stops the matrix — its failure is captured
 * deterministically and execution continues.
 */

import { runBrainDryRun } from './brain-dry-run-harness.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

const DEFAULT_DEPS = Object.freeze({ runDryRun: runBrainDryRun })

/** A scenario's `expected` is a partial match over the dry-run verification object. */
function matchesExpected(verification, expected) {
  return Object.keys(expected).every((k) => JSON.stringify(verification[k]) === JSON.stringify(expected[k]))
}

/**
 * Run a fixed list of dry-run scenarios and return a frozen pass/fail matrix.
 *
 * @param {Array<{ id:string, squadLoader:object, decisionPlanSource:object, expected?:object }>} scenarios
 * @param {{ pipelineServices?: object, confidenceProvider?: object, squadOptions?: object }} [options]
 *   passed through to each runBrainDryRun call
 * @param {{ runDryRun: Function }} [deps]  defaults to the real M178 harness — injectable for tests
 * @returns {Readonly<{ total:number, passed:number, failed:number,
 *   scenarios: ReadonlyArray<Readonly<{ id:string, ok:boolean, dryRun:(object|null), verification:(object|null), error:(string|null) }>> }>}
 */
export function runBrainDryRunMatrix(scenarios, options = {}, deps = DEFAULT_DEPS) {
  if (!Array.isArray(scenarios)) throw new TypeError('runBrainDryRunMatrix requires an array of scenarios')
  if (!isObj(options)) throw new TypeError('runBrainDryRunMatrix: options must be an object')
  if (!isObj(deps) || typeof deps.runDryRun !== 'function') throw new TypeError('runBrainDryRunMatrix: deps.runDryRun must be a function')

  // validate scenario SHAPES upfront — malformed scenarios are rejected clearly (a bad provider is not malformed; it fails per-scenario)
  scenarios.forEach((s, i) => {
    if (!isObj(s)) throw new TypeError(`runBrainDryRunMatrix: scenario[${i}] must be an object`)
    if (!isNonEmptyString(s.id)) throw new TypeError(`runBrainDryRunMatrix: scenario[${i}] requires a non-empty string id`)
    if (s.expected !== undefined && !isObj(s.expected)) throw new TypeError(`runBrainDryRunMatrix: scenario[${i}].expected must be an object when provided`)
  })

  const results = []
  let passed = 0

  for (const s of scenarios) {
    let entry
    try {
      const dryRun = deps.runDryRun({ squadLoader: s.squadLoader, decisionPlanSource: s.decisionPlanSource }, options)
      const verification = isObj(dryRun) ? dryRun.verification : null
      const ok = s.expected === undefined ? true : (isObj(verification) && matchesExpected(verification, s.expected))
      if (ok) passed += 1
      entry = { id: s.id, ok, dryRun, verification, error: null }
    } catch (e) {
      entry = { id: s.id, ok: false, dryRun: null, verification: null, error: e instanceof Error ? e.message : String(e) }
    }
    results.push(entry)
  }

  return deepFreeze({
    total: scenarios.length,
    passed,
    failed: scenarios.length - passed,
    scenarios: results,
  })
}
