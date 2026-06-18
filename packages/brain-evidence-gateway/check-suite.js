/**
 * @brain/evidence-gateway — expectation-suite / multi-case regression gate (M68, DORMANT)
 *
 * A pure deterministic gate that runs the M67 single-case gate
 * (`checkPipelineAgainstExpected`) across an array of expectation cases and folds the
 * per-case verdicts into one immutable aggregate. It REUSES M67 only (no duplicated diff
 * or check logic) and only READS its inputs: no store, graph, engine, persistence,
 * runtime, UI, API, no clock, no randomness.
 *
 * Each case is `{ name, planOrSnapshot, expectedSnapshot, allowlist? }`. A suite-level
 * allowlist is the default; a case's own `allowlist` (when provided) overrides it for that
 * case. The aggregate reports overall pass/fail, every per-case verdict (in input order),
 * the first failing case, passing/failing counts, the union of stages affected by
 * violations, and a tolerated-vs-violation roll-up. An empty suite passes vacuously.
 * Output is deeply frozen; inputs are never mutated.
 */

import { checkPipelineAgainstExpected } from './check.js'

/**
 * Run a suite of expectation cases through the M67 gate and aggregate the verdicts.
 *
 * @param {Array<{ name:string, planOrSnapshot:object, expectedSnapshot:object,
 *                 allowlist?:(string[] | { paths?:string[], stages?:string[] }) }>} cases
 * @param {{ allowlist?: (string[] | { paths?:string[], stages?:string[] }) }} [options]
 *   allowlist — suite-wide default, overridden per-case when a case supplies its own.
 * @returns {Readonly<{
 *   pass:boolean,
 *   total:number, passed:number, failed:number,
 *   firstFailingCase: string|null,
 *   cases: ReadonlyArray<Readonly<{ name:string, pass:boolean, verdict:object }>>,
 *   affectedStages: ReadonlyArray<string>,
 *   summary: Readonly<{ violations:number, tolerated:number, affectedStages:number }>
 * }>}
 */
export function checkPipelineSuite(cases, options = {}) {
  if (!Array.isArray(cases)) {
    throw new TypeError('checkPipelineSuite requires an array of cases')
  }
  const suiteAllowlist = options && options.allowlist

  const results = []
  const stageSet = new Set()
  let passed = 0
  let firstFailingCase = null
  let violations = 0
  let tolerated = 0

  for (const c of cases) {
    if (!c || typeof c !== 'object') {
      throw new TypeError('checkPipelineSuite: each case must be an object { name, planOrSnapshot, expectedSnapshot }')
    }
    const allowlist = c.allowlist !== undefined ? c.allowlist : suiteAllowlist
    const verdict = checkPipelineAgainstExpected(c.planOrSnapshot, c.expectedSnapshot, { allowlist })

    if (verdict.pass) passed++
    else if (firstFailingCase === null) firstFailingCase = c.name
    for (const s of verdict.affectedStages) stageSet.add(s)
    violations += verdict.summary.total
    tolerated += verdict.summary.tolerated

    results.push(Object.freeze({ name: c.name, pass: verdict.pass, verdict }))
  }

  const total = results.length
  const failed = total - passed
  const affectedStages = [...stageSet].sort()

  return Object.freeze({
    pass: failed === 0,
    total,
    passed,
    failed,
    firstFailingCase,
    cases: Object.freeze(results),
    affectedStages: Object.freeze(affectedStages),
    summary: Object.freeze({
      violations,
      tolerated,
      affectedStages: affectedStages.length,
    }),
  })
}
