/**
 * @coach-intelligence — Readiness Report Gate Envelope (M212, DORMANT, read-only)
 *
 * Wraps an M211 squad-readiness report in a deterministic, evidence-style envelope so the Brain can
 * package a report with metadata + a pass/fail gate BEFORE anything trusts it downstream. It NEVER
 * changes the report content (it embeds it verbatim), makes no selection recommendations, calls no
 * AI, and touches no database/network/filesystem/timestamp/clock/randomness.
 *
 * Pure and deterministic; input never mutated; output deeply frozen.
 *
 * Input: an M211 `summarizeSquadReadiness(..., 'object')` report
 *   { readinessLevel, confidenceLevel, counts, positionGroups, trend }
 */

const REPORT_TYPE = 'squad-readiness-report'
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

/** Plain-JSON deep clone — the embedded report is never shared by reference (and never changed). */
function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (isObj(value)) { const o = {}; for (const k of Object.keys(value)) o[k] = clone(value[k]); return o }
  return value
}

/**
 * Gate + envelope an M211 readiness report.
 *
 * @param {object} report  an M211 readiness report (object form)
 * @returns {Readonly<{ type:string, schemaVersion:number, readinessLevel:string,
 *   confidenceLevel:(string|null), sections:string[], warnings:string[],
 *   gate: Readonly<{ status:string, reasons:string[] }>, report:object }>}
 */
export function gateReadinessReport(report) {
  if (!isObj(report) || typeof report.readinessLevel !== 'string') {
    throw new TypeError('gateReadinessReport requires an M211 readiness report with a string readinessLevel')
  }

  const readinessLevel = report.readinessLevel
  const confidenceLevel = strOrNull(report.confidenceLevel)
  const hasPositionGroups = Array.isArray(report.positionGroups) && report.positionGroups.length > 0
  const hasTrend = isObj(report.trend)
  const missingInformation = isObj(report.counts) ? numOr0(report.counts.missingInformation) : 0

  // generated sections present in the report
  const sections = []
  if (isObj(report.counts)) sections.push('counts')
  if (hasPositionGroups) sections.push('positionGroups')
  if (hasTrend) sections.push('trend')

  // warnings — missing source data or low confidence (observations only, never advice)
  const warnings = new Set()
  if (readinessLevel === 'NO_SQUAD') warnings.add('NO_SQUAD')
  if (confidenceLevel === 'LOW' || confidenceLevel === 'NONE') warnings.add('LOW_CONFIDENCE')
  if (!hasPositionGroups) warnings.add('NO_POSITION_DATA')
  if (!hasTrend) warnings.add('NO_TREND')
  if (missingInformation > 0) warnings.add('MISSING_PLAYER_INFORMATION')
  const sortedWarnings = [...warnings].sort(sortStr)

  // pass/fail gate: empty squad ⇒ FAIL, any warning ⇒ WARN, otherwise PASS
  let status
  if (readinessLevel === 'NO_SQUAD') status = 'FAIL'
  else if (sortedWarnings.length > 0) status = 'WARN'
  else status = 'PASS'
  const reasons = status === 'PASS' ? [] : sortedWarnings

  return deepFreeze({
    type: REPORT_TYPE,
    schemaVersion: SCHEMA_VERSION,
    readinessLevel,
    confidenceLevel,
    sections,
    warnings: sortedWarnings,
    gate: { status, reasons },
    report: clone(report),   // embedded verbatim — never altered
  })
}
