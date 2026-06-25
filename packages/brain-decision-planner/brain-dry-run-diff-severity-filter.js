/**
 * @brain-decision-planner — Decision Diff Severity Filter (M202, DORMANT, diagnostics-only)
 *
 * A pure, deterministic query helper over an M196 decision-diff matrix result: it surfaces only the
 * pairs whose M199/M200 severity is at or above a threshold band. Reads only the passed matrix
 * result — it runs no diff, classifies nothing, calls no providers, and derives no conclusions. No
 * timestamps/randomness/network/persistence/Core changes. Inputs are never mutated; output is frozen.
 *
 * Severity order: NONE < MINOR < MODERATE < MAJOR < CRITICAL. Pairs without a severity (failed/
 * unscored) are excluded from the matched set.
 */

const SEVERITY_ORDER = Object.freeze(['NONE', 'MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'])
const rank = (s) => SEVERITY_ORDER.indexOf(s)

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (isObj(value)) { const o = {}; for (const k of Object.keys(value)) o[k] = clone(value[k]); return o }
  return value
}

/**
 * Filter an M196 matrix result to pairs at or above a severity band.
 *
 * @param {object} matrixResult  an M196 runBrainDryRunDiffMatrix result
 * @param {('NONE'|'MINOR'|'MODERATE'|'MAJOR'|'CRITICAL')} minSeverity
 * @returns {Readonly<{ minSeverity:string, total:number, matched:number,
 *   pairs: ReadonlyArray<object>, severityCounts: object }>}
 */
export function filterDiffMatrixBySeverity(matrixResult, minSeverity) {
  if (typeof minSeverity !== 'string' || !SEVERITY_ORDER.includes(minSeverity)) {
    throw new TypeError(`filterDiffMatrixBySeverity: minSeverity must be one of ${SEVERITY_ORDER.join(' | ')}`)
  }
  if (!isObj(matrixResult) || !Array.isArray(matrixResult.pairs)) {
    throw new TypeError('filterDiffMatrixBySeverity requires an M196 matrix result { pairs }')
  }

  const min = rank(minSeverity)
  const matched = matrixResult.pairs.filter((p) => isObj(p) && typeof p.severity === 'string' && SEVERITY_ORDER.includes(p.severity) && rank(p.severity) >= min)

  const severity = {}
  for (const p of matched) severity[p.severity] = (severity[p.severity] || 0) + 1
  const severityCounts = {}
  for (const k of Object.keys(severity).sort(sortStr)) severityCounts[k] = severity[k]

  return deepFreeze({
    minSeverity,
    total: matrixResult.pairs.length,
    matched: matched.length,
    pairs: matched.map(clone),
    severityCounts,
  })
}
