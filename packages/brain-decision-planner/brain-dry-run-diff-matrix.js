/**
 * @brain-decision-planner — Decision Diff Matrix (M196, DORMANT, diagnostics-only)
 *
 * Runs the M194 dry-run diff harness across a fixed list of before/after dry-run pairs, in input
 * order, and rolls up which decision-change codes appeared across the set. Diagnostics ONLY: no
 * selection, scoring, ranking, recommendations, advice, providers, pipeline reruns, persistence,
 * networking, timestamps, randomness, UI, or Core changes. Inputs are never mutated; the result is
 * deeply frozen. One failing pair never stops the matrix — its error is captured and execution
 * continues.
 */

import { diffBrainDryRuns } from './brain-dry-run-diff-harness.js'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0
const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

const DEFAULT_DEPS = Object.freeze({ diff: diffBrainDryRuns })

/** A pair's `expected` is a partial match over the diff view (M193 object form). */
function matchesExpected(diffView, expected) {
  return Object.keys(expected).every((k) => JSON.stringify(isObj(diffView) ? diffView[k] : undefined) === JSON.stringify(expected[k]))
}

/** Roll up change codes across pairs that ran successfully (errored pairs excluded). */
function buildRollup(entries) {
  const counts = {}
  let changedPairCount = 0
  let unchangedPairCount = 0
  for (const e of entries) {
    if (e.error !== null) continue
    const summary = isObj(e.diff) && isObj(e.diff.summary) ? e.diff.summary : null
    const codes = summary && Array.isArray(summary.codes) ? summary.codes : []
    if (summary && summary.changed) changedPairCount += 1
    else unchangedPairCount += 1
    for (const c of codes) if (typeof c === 'string') counts[c] = (counts[c] || 0) + 1
  }
  const changeCodeCounts = {}
  for (const k of Object.keys(counts).sort(sortStr)) changeCodeCounts[k] = counts[k]
  return { changeCodeCounts, changedPairCount, unchangedPairCount }
}

/**
 * Run a list of dry-run diff pairs and return a frozen pass/fail matrix with a change-code rollup.
 *
 * @param {Array<{ id:string, before:object, after:object, expected?:object }>} pairs
 *   before/after are completed M186 dry-run results
 * @param {object} [options]  reserved (no options consumed today; validated for shape)
 * @param {{ diff: Function }} [deps]  defaults to the real M194 harness — injectable for tests
 * @returns {Readonly<{ total:number, passed:number, failed:number,
 *   pairs: ReadonlyArray<Readonly<{ id:string, ok:boolean, diff:(object|null), diffView:(object|null), error:(string|null) }>>,
 *   rollup: Readonly<{ changeCodeCounts:object, changedPairCount:number, unchangedPairCount:number }> }>}
 */
export function runBrainDryRunDiffMatrix(pairs, options = {}, deps = DEFAULT_DEPS) {
  if (!Array.isArray(pairs)) throw new TypeError('runBrainDryRunDiffMatrix requires an array of pairs')
  if (!isObj(options)) throw new TypeError('runBrainDryRunDiffMatrix: options must be an object')
  if (!isObj(deps) || typeof deps.diff !== 'function') throw new TypeError('runBrainDryRunDiffMatrix: deps.diff must be a function')

  // validate pair SHAPES upfront — malformed pairs are rejected clearly (bad dry-run data fails per-pair)
  pairs.forEach((p, i) => {
    if (!isObj(p)) throw new TypeError(`runBrainDryRunDiffMatrix: pair[${i}] must be an object`)
    if (!isNonEmptyString(p.id)) throw new TypeError(`runBrainDryRunDiffMatrix: pair[${i}] requires a non-empty string id`)
    if (p.expected !== undefined && !isObj(p.expected)) throw new TypeError(`runBrainDryRunDiffMatrix: pair[${i}].expected must be an object when provided`)
  })

  const results = []
  let passed = 0

  for (const p of pairs) {
    let entry
    try {
      const out = deps.diff(p.before, p.after)   // M194 → { beforeSummary, afterSummary, diff, diffView }
      const diff = isObj(out) ? out.diff : null
      const diffView = isObj(out) ? out.diffView : null
      const ok = p.expected === undefined ? true : matchesExpected(diffView, p.expected)
      if (ok) passed += 1
      entry = { id: p.id, ok, diff, diffView, error: null }
    } catch (e) {
      entry = { id: p.id, ok: false, diff: null, diffView: null, error: e instanceof Error ? e.message : String(e) }
    }
    results.push(entry)
  }

  return deepFreeze({
    total: pairs.length,
    passed,
    failed: pairs.length - passed,
    pairs: results,
    rollup: buildRollup(results),
  })
}
