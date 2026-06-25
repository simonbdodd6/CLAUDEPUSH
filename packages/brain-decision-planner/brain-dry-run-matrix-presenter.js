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
const numOrNull = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const lenOrNull = (x) => (Array.isArray(x) ? x.length : null)

/**
 * Read the M184/M185 explanation counts that M186 already placed on dryRun — never recompute.
 * Prefers the M185 explanationView.counts; falls back to M184 explanation section lengths; otherwise
 * (no explanation present, e.g. a failed scenario) returns nulls.
 */
function explanationCounts(dryRun) {
  const counts = isObj(dryRun) && isObj(dryRun.explanationView) && isObj(dryRun.explanationView.counts) ? dryRun.explanationView.counts : null
  if (counts) {
    return {
      explanationStarterCount: numOrNull(counts.starters),
      explanationBenchCount: numOrNull(counts.bench),
      explanationRiskCount: numOrNull(counts.risks),
    }
  }
  const expl = isObj(dryRun) && isObj(dryRun.explanation) ? dryRun.explanation : null
  return {
    explanationStarterCount: expl ? lenOrNull(expl.starters) : null,
    explanationBenchCount: expl ? lenOrNull(expl.bench) : null,
    explanationRiskCount: expl ? lenOrNull(expl.risks) : null,
  }
}

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

/** Normalise one matrix scenario; missing verification fields default to 0, missing explanation to null. */
function scenarioSummary(s) {
  const v = isObj(s.verification) ? s.verification : {}
  const e = explanationCounts(s.dryRun)   // read-only from M186's dryRun.explanation/explanationView
  const startingCount = numOr0(v.startingCount)
  // explanation coverage = explained starters / starters; null when undefined (no starters or no explanation)
  const explanationCoverage = (startingCount === 0 || e.explanationStarterCount === null)
    ? null
    : Math.round((e.explanationStarterCount / startingCount) * 100) / 100
  return {
    id: s.id,
    ok: s.ok === true,
    startingCount,
    benchCount: numOr0(v.benchCount),
    reserveCount: numOr0(v.reserveCount),
    warningCount: numOr0(v.warningCount),
    explanationStarterCount: e.explanationStarterCount,
    explanationBenchCount: e.explanationBenchCount,
    explanationRiskCount: e.explanationRiskCount,
    explanationCoverage,
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
    const expl = s.explanationStarterCount !== null
      ? ` explanationStarters=${s.explanationStarterCount} explanationBench=${s.explanationBenchCount} explanationRisks=${s.explanationRiskCount} explanationCoverage=${s.explanationCoverage}`
      : ''
    return `${base} starting=${s.startingCount} bench=${s.benchCount} reserves=${s.reserveCount} warnings=${s.warningCount}${expl}`
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
