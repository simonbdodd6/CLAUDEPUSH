/**
 * @brain-decision-planner — Brain Dry Run Matrix Presenter (DORMANT, diagnostics-only)
 *
 * A pure, deterministic presenter for an M179 dry-run matrix result. It makes the matrix readable
 * for engineering logs/diagnostics ONLY — it is not user-facing coaching output, runtime wiring, AI,
 * or recommendation generation. It reads only the passed matrix result: it calls no providers, runs
 * no pipeline, never invokes runBrainDryRunMatrix, derives no coaching conclusions, and produces no
 * timestamps/randomness/network/persistence. Object output is deeply frozen.
 *
 * Formats: 'object' (default), 'text', 'json'. JSON uses deterministic JSON.stringify over the
 * normalized summary (which has a fixed key order) — no canonical-JSON helper is imported, so the
 * package gains no new dependency edge.
 */

const SUPPORTED_FORMATS = Object.freeze(['object', 'text', 'json'])

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Validate the M179 matrix result shape this presenter reads. */
function assertMatrix(matrixResult) {
  if (!isObj(matrixResult) || !Array.isArray(matrixResult.scenarios) ||
      typeof matrixResult.total !== 'number' || typeof matrixResult.passed !== 'number' || typeof matrixResult.failed !== 'number') {
    throw new TypeError('summarizeBrainDryRunMatrix requires an M179 matrix result { total, passed, failed, scenarios }')
  }
  for (const s of matrixResult.scenarios) {
    if (!isObj(s) || typeof s.id !== 'string' || typeof s.ok !== 'boolean') {
      throw new TypeError('summarizeBrainDryRunMatrix: malformed scenario in matrix result')
    }
  }
}

/** Normalise one matrix scenario; missing verification fields default safely to 0. */
function scenarioSummary(s) {
  const v = isObj(s.verification) ? s.verification : {}
  return {
    id: s.id,
    ok: s.ok === true,
    startingCount: numOr0(v.startingCount),
    benchCount: numOr0(v.benchCount),
    reserveCount: numOr0(v.reserveCount),
    warningCount: numOr0(v.warningCount),
    error: typeof s.error === 'string' ? s.error : null,
  }
}

/** Build the normalized summary object (fixed key order → deterministic JSON). */
function buildSummary(matrixResult) {
  const { total, passed, failed } = matrixResult
  const passRate = total === 0 ? 0 : Math.round((passed / total) * 100) / 100
  return {
    total,
    passed,
    failed,
    passRate,
    scenarios: matrixResult.scenarios.map(scenarioSummary),
  }
}

/** Render the summary as a deterministic multi-line string. */
function renderText(summary) {
  const header = `BrainDryRunMatrix total=${summary.total} passed=${summary.passed} failed=${summary.failed} passRate=${summary.passRate}`
  const lines = summary.scenarios.map((s) => {
    const base = `${s.id} ok=${s.ok}`
    if (s.error !== null) return `${base} error="${s.error}"`
    return `${base} starting=${s.startingCount} bench=${s.benchCount} reserves=${s.reserveCount} warnings=${s.warningCount}`
  })
  return [header, ...lines].join('\n')
}

/**
 * Summarize an M179 dry-run matrix result for engineering logs.
 *
 * @param {object} matrixResult  an M179 matrix result
 * @param {('object'|'text'|'json')} [format='object']
 * @returns {(Readonly<object>|string)}  frozen summary object ('object'), or a string ('text'/'json')
 */
export function summarizeBrainDryRunMatrix(matrixResult, format = 'object') {
  if (typeof format !== 'string' || !SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeBrainDryRunMatrix: unsupported format "${format}" (expected object | text | json)`)
  }
  assertMatrix(matrixResult)

  const summary = buildSummary(matrixResult)
  if (format === 'text') return renderText(summary)
  if (format === 'json') return JSON.stringify(summary)
  return deepFreeze(summary)
}
