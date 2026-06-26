/**
 * @coach-intelligence — Readiness Evidence Bundle (M213, DORMANT, read-only)
 *
 * Packages the OUTPUTS of the readiness modules into one immutable evidence bundle for downstream Brain
 * components — without recomputing anything. It combines: individual readiness (M206), individual
 * explanations (M208), squad summary (M209), squad trend (M210, when available), report presenter
 * (M211), and gate envelope (M212). Every source object is preserved verbatim.
 *
 * It calculates no new readiness values, recommends no selections, calls no AI, and touches no
 * database/network/filesystem/timestamp/clock/randomness. Pure, deterministic; inputs never mutated;
 * output deeply frozen. It reuses the modules' outputs (no duplicated logic) — it imports none of them.
 *
 * Input: { readiness?, explanations?, squadSummary?, trend?, report?, envelope? }
 *   - readiness     : an M206 assessMatchReadiness result    { status, codes, metrics }
 *   - explanations  : an array of M208 explainPlayerReadiness results
 *   - squadSummary  : an M209 assessSquadReadiness result     { readinessLevel, confidence, counts, ... }
 *   - trend         : an M210 analyzeSquadReadinessTrend result
 *   - report        : an M211 summarizeSquadReadiness object  { readinessLevel, confidenceLevel, ... }
 *   - envelope      : an M212 gateReadinessReport result      { gate, warnings, ... }
 */

const BUNDLE_TYPE = 'readiness-evidence-bundle'
const SCHEMA_VERSION = 1

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const numOr0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const strOrNull = (v) => (typeof v === 'string' ? v : null)
const sortStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) deepFreeze(value[k])
    Object.freeze(value)
  }
  return value
}

/** Plain-JSON deep clone — each source is embedded by value, never shared or modified. */
function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (isObj(value)) { const o = {}; for (const k of Object.keys(value)) o[k] = clone(value[k]); return o }
  return value
}

/** Read an optional component; throw on a present-but-malformed value. */
function component(input, key, valid) {
  const v = input[key]
  if (v === undefined || v === null) return null
  if (!valid(v)) throw new TypeError(`buildReadinessEvidenceBundle: ${key} is malformed`)
  return v
}

/** Collect warning codes from every component (deduped + sorted) — never invents new ones. */
function collectWarnings({ readiness, squadSummary, report, envelope }) {
  const w = new Set()
  if (readiness && Array.isArray(readiness.codes)) for (const c of readiness.codes) if (typeof c === 'string') w.add(c)
  if (envelope && Array.isArray(envelope.warnings)) for (const c of envelope.warnings) if (typeof c === 'string') w.add(c)
  if (squadSummary) {
    const lvl = isObj(squadSummary.confidence) ? squadSummary.confidence.level : null
    if (lvl === 'LOW' || lvl === 'NONE') w.add('LOW_CONFIDENCE')
    if (isObj(squadSummary.counts) && numOr0(squadSummary.counts.missingInformation) > 0) w.add('MISSING_PLAYER_INFORMATION')
  }
  if (report && (report.confidenceLevel === 'LOW' || report.confidenceLevel === 'NONE')) w.add('LOW_CONFIDENCE')
  return [...w].sort(sortStr)
}

/**
 * Build one immutable readiness evidence bundle from the readiness module outputs.
 *
 * @param {object} input  { readiness?, explanations?, squadSummary?, trend?, report?, envelope? }
 * @returns {Readonly<{ type:string, schemaVersion:number, manifest:object, components:string[],
 *   validation:object, confidence:object, warnings:string[], sources:object }>}
 */
export function buildReadinessEvidenceBundle(input) {
  if (!isObj(input)) throw new TypeError('buildReadinessEvidenceBundle requires an input object')

  const readiness = component(input, 'readiness', isObj)
  const explanations = component(input, 'explanations', (v) => Array.isArray(v) && v.every(isObj))
  const squadSummary = component(input, 'squadSummary', isObj)
  const trend = component(input, 'trend', isObj)
  const report = component(input, 'report', isObj)
  const envelope = component(input, 'envelope', isObj)

  const manifest = {
    readiness: readiness !== null,
    explanations: explanations !== null && explanations.length > 0,
    squadSummary: squadSummary !== null,
    trend: trend !== null,
    report: report !== null,
    envelope: envelope !== null,
  }
  const components = Object.keys(manifest).filter((k) => manifest[k]).sort(sortStr)

  // validation status reuses the M212 gate when present (never recomputed here)
  const validation = envelope
    ? { status: isObj(envelope.gate) && typeof envelope.gate.status === 'string' ? envelope.gate.status : 'UNVALIDATED', source: 'envelope' }
    : { status: 'UNVALIDATED', source: 'none' }

  // confidence summary surfaced from the highest-authority component present (no recompute)
  let confidence
  if (envelope && strOrNull(envelope.confidenceLevel) !== null) confidence = { level: envelope.confidenceLevel, source: 'envelope' }
  else if (report && strOrNull(report.confidenceLevel) !== null) confidence = { level: report.confidenceLevel, source: 'report' }
  else if (squadSummary && isObj(squadSummary.confidence) && strOrNull(squadSummary.confidence.level) !== null) confidence = { level: squadSummary.confidence.level, source: 'squadSummary' }
  else confidence = { level: null, source: 'none' }

  const warnings = collectWarnings({ readiness, squadSummary, report, envelope })

  return deepFreeze({
    type: BUNDLE_TYPE,
    schemaVersion: SCHEMA_VERSION,
    manifest,
    components,
    validation,
    confidence,
    warnings,
    sources: {                                   // every source preserved verbatim (cloned)
      readiness: readiness ? clone(readiness) : null,
      explanations: explanations ? clone(explanations) : null,
      squadSummary: squadSummary ? clone(squadSummary) : null,
      trend: trend ? clone(trend) : null,
      report: report ? clone(report) : null,
      envelope: envelope ? clone(envelope) : null,
    },
  })
}
