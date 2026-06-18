/**
 * @brain/evidence-gateway — gate report serializers / serializeGateReport (M81, DORMANT)
 *
 * Pure deterministic serializers that render an M69 human report into stable text
 * representations, completing the serializer trio alongside the M73 outcome and M79
 * decision serializers. Three formats:
 *   - "text"     → the report's existing `text` field verbatim
 *   - "json"     → canonical, key-sorted JSON (reuses the M65 `canonicalStringify`)
 *   - "markdown" → deterministic Markdown built from existing report fields only; any
 *                  missing field's section is omitted cleanly (no invented data)
 *
 * It REUSES the M69 report fields and the existing canonicaliser only — no new gate /
 * diff / policy / report logic and no hand-rolled JSON — and only READS its input
 * (returns a string; writes nothing). No store, engine, persistence, filesystem, API,
 * network, clock or randomness. The input report is never mutated.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['text', 'json', 'markdown'])
const isObj = (v) => v !== null && typeof v === 'object'
const isNum = (v) => typeof v === 'number'

/** Build deterministic Markdown from whatever M69 report fields are present. */
function toMarkdown(report) {
  const blocks = []

  if (typeof report.headline === 'string') blocks.push(`# ${report.headline}`)
  if (typeof report.pass === 'boolean') blocks.push(`**Status:** ${report.pass ? 'PASS' : 'FAIL'}`)

  const summary = isObj(report.summary) ? report.summary : null
  const cases = Array.isArray(report.cases) ? report.cases : null

  // case counts + first failing case
  const meta = []
  if (summary && isNum(summary.totalCases)) {
    meta.push(`**Cases:** total=${summary.totalCases} passed=${summary.passed} failed=${summary.failed}`)
  }
  if (cases && cases.length) meta.push(`**First failing case:** ${cases[0].name}`)
  if (meta.length) blocks.push(meta.join('\n'))

  // violation / tolerated / affected-stages roll-up
  if (summary) {
    const parts = []
    if (isNum(summary.violations)) parts.push(`**Violations:** ${summary.violations}`)
    if (isNum(summary.tolerated)) parts.push(`**Tolerated:** ${summary.tolerated}`)
    if (Array.isArray(summary.affectedStages)) {
      parts.push(`**Affected stages:** ${summary.affectedStages.length ? summary.affectedStages.join(', ') : 'none'}`)
    }
    if (parts.length) blocks.push(parts.join('  '))
  }

  // per-failing-case sections
  if (cases && cases.length) {
    blocks.push('## Failing cases')
    for (const cr of cases) {
      const lines = [`### ${cr.name}`]
      const cs = Array.isArray(cr.affectedStages) && cr.affectedStages.length ? cr.affectedStages.join(', ') : 'none'
      lines.push(`- stages: ${cs}`)
      const v = isObj(cr.violations) ? cr.violations : null
      if (v) lines.push(`- violations: ${v.total} (added=${v.added} removed=${v.removed} changed=${v.changed})`)
      if (Array.isArray(cr.sample)) for (const e of cr.sample) lines.push(`  - \`${e.kind}\` ${e.path}`)
      if (isNum(cr.truncated) && cr.truncated > 0) lines.push(`  - …and ${cr.truncated} more`)
      blocks.push(lines.join('\n'))
    }
  }

  return blocks.join('\n\n')
}

/**
 * Serialize an M69 human report into a stable text representation.
 *
 * @param {object} report  a report from `formatPipelineSuiteReport` (M69)
 * @param {{ format?: ('text'|'json'|'markdown') }} [options]  default format: "text"
 * @returns {string}
 */
export function serializeGateReport(report, options = {}) {
  if (!isObj(report)) {
    throw new TypeError('serializeGateReport requires an M69 gate report object')
  }
  const format = (options && options.format !== undefined) ? options.format : 'text'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`serializeGateReport: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'text') return String(report.text)
  if (format === 'json') return canonicalStringify(report)
  return toMarkdown(report)   // format === 'markdown'
}
