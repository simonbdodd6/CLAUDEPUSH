/**
 * @brain-decision-planner — Decision Diff Matrix Presenter (M197, DORMANT, diagnostics-only)
 *
 * A pure, deterministic presenter for an M196 decision-diff matrix result. It makes the per-pair
 * change codes and the run-wide rollup readable for engineering logs ONLY — not user-facing coaching
 * advice, runtime wiring, AI, or recommendation. It reads only the passed matrix result: it calls no
 * providers, runs no diff/pipeline, never invokes runBrainDryRunDiffMatrix, and derives no
 * conclusions. No timestamps/randomness/network/persistence/Core changes. Object output is frozen.
 *
 * Formats: 'object' (default), 'text', 'json'. JSON uses deterministic JSON.stringify over the
 * normalized summary (fixed key order) — no canonical-JSON helper imported, so no new dependency edge
 * (matching the M180 dry-run matrix presenter).
 */

const SUPPORTED_FORMATS = Object.freeze(['object', 'text', 'json'])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)
const codesOf = (v) => (Array.isArray(v) ? v.filter((c) => typeof c === 'string') : [])
const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the M196 matrix result shape this presenter reads. */
function assertMatrix(matrixResult) {
  if (!isObj(matrixResult) || !Array.isArray(matrixResult.pairs) || !isObj(matrixResult.rollup) ||
      typeof matrixResult.total !== 'number' || typeof matrixResult.passed !== 'number' || typeof matrixResult.failed !== 'number') {
    throw new TypeError('summarizeBrainDryRunDiffMatrix requires an M196 matrix result { total, passed, failed, pairs, rollup }')
  }
  for (const p of matrixResult.pairs) {
    if (!isObj(p) || typeof p.id !== 'string' || typeof p.ok !== 'boolean') {
      throw new TypeError('summarizeBrainDryRunDiffMatrix: malformed pair in matrix result')
    }
  }
}

/** Normalise one pair from its diffView (missing/failed → safe defaults). */
function pairSummary(p) {
  const dv = isObj(p.diffView) ? p.diffView : null
  return {
    id: p.id,
    ok: p.ok === true,
    changed: dv ? dv.changed === true : false,
    changeCount: dv ? numOr0(dv.changeCount) : 0,
    codes: dv ? codesOf(dv.codes) : [],
    error: typeof p.error === 'string' ? p.error : null,
  }
}

/** Rebuild changeCodeCounts with sorted keys (deterministic). */
function sortedCounts(counts) {
  const out = {}
  if (isObj(counts)) for (const k of Object.keys(counts).sort(sortStr)) out[k] = numOr0(counts[k])
  return out
}

function buildSummary(matrixResult) {
  const r = isObj(matrixResult.rollup) ? matrixResult.rollup : {}
  return {
    total: matrixResult.total,
    passed: matrixResult.passed,
    failed: matrixResult.failed,
    pairs: matrixResult.pairs.map(pairSummary),
    rollup: {
      changeCodeCounts: sortedCounts(r.changeCodeCounts),
      changedPairCount: numOr0(r.changedPairCount),
      unchangedPairCount: numOr0(r.unchangedPairCount),
    },
  }
}

/** Render the summary as a deterministic multi-line string. */
function renderText(summary) {
  const lines = [`BrainDryRunDiffMatrix total=${summary.total} passed=${summary.passed} failed=${summary.failed} changed=${summary.rollup.changedPairCount} unchanged=${summary.rollup.unchangedPairCount}`]
  for (const p of summary.pairs) {
    if (p.error !== null) { lines.push(`${p.id} ok=${p.ok} error="${p.error}"`); continue }
    lines.push(`${p.id} ok=${p.ok} changed=${p.changed} changes=${p.changeCount} codes=${p.codes.join(',')}`)
  }
  const counts = summary.rollup.changeCodeCounts
  const rollupStr = Object.keys(counts).map((k) => `${k}=${counts[k]}`).join(' ')
  lines.push(rollupStr ? `rollup ${rollupStr}` : 'rollup')
  return lines.join('\n')
}

/**
 * Summarize an M196 decision-diff matrix result for engineering logs.
 *
 * @param {object} matrixResult  an M196 matrix result
 * @param {('object'|'text'|'json')} [format='object']
 * @returns {(Readonly<object>|string)}  frozen summary object ('object'), or a string ('text'/'json')
 */
export function summarizeBrainDryRunDiffMatrix(matrixResult, format = 'object') {
  if (typeof format !== 'string' || !SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeBrainDryRunDiffMatrix: unsupported format "${format}" (expected object | text | json)`)
  }
  assertMatrix(matrixResult)

  const summary = buildSummary(matrixResult)
  if (format === 'text') return renderText(summary)
  if (format === 'json') return JSON.stringify(summary)
  return deepFreeze(summary)
}
