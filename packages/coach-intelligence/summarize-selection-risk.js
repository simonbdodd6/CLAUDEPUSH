/**
 * @coach-intelligence — Selection Risk Summary (M125, DORMANT)
 *
 * Pure deterministic presentation of an M124 selection-risk report. It reuses ONLY the M124
 * output — it analyses nothing, scores nothing, and changes no risks. Four formats:
 *   - "line"     → `selection-risk overall=… total=… critical=… high=… medium=… low=…` (default)
 *   - "text"     → a titled block with non-empty severity groups
 *   - "markdown" → a heading + all four severity sections (empty sections shown)
 *   - "json"     → canonical, key-sorted JSON (reuses the shared M65 `canonicalStringify`)
 *
 * Reads only — no mutation, filesystem, persistence, APIs, network, randomness or clock.
 */

import { canonicalStringify } from '@brain/evidence-gateway'

const SUPPORTED_FORMATS = Object.freeze(['line', 'text', 'markdown', 'json'])
const SEVERITIES = Object.freeze(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
const SEVERITY_LABEL = Object.freeze({ CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' })

const isObj = (v) => v !== null && typeof v === 'object'

/** Validate the M124 risk report (the fields this presenter reads). */
function assertRiskReport(r) {
  if (!isObj(r) || Array.isArray(r) || typeof r.overallRisk !== 'string' || !Array.isArray(r.risks) || !isObj(r.metadata)) {
    throw new TypeError('summarizeSelectionRisk requires an M124 selection-risk report')
  }
  for (const risk of r.risks) {
    if (!isObj(risk) || !SEVERITIES.includes(risk.severity) || typeof risk.reason !== 'string') {
      throw new TypeError('summarizeSelectionRisk: malformed risk entry')
    }
  }
}

/** risks grouped by severity, preserving M124's order within each group. */
const groupBySeverity = (risks) => SEVERITIES.map((sev) => [sev, risks.filter((r) => r.severity === sev)])

function toLine(report) {
  const c = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const r of report.risks) c[r.severity]++
  return `selection-risk overall=${report.overallRisk} total=${report.risks.length} critical=${c.CRITICAL} high=${c.HIGH} medium=${c.MEDIUM} low=${c.LOW}`
}

function toText(report) {
  const lines = ['Selection Risk', '', `Overall Risk: ${report.overallRisk}`, '', `Total Risks: ${report.risks.length}`]
  for (const [sev, group] of groupBySeverity(report.risks)) {
    if (group.length === 0) continue            // text shows only non-empty severity groups
    lines.push('', sev)
    for (const risk of group) lines.push(`- ${risk.reason}`)
  }
  return lines.join('\n')
}

function toMarkdown(report) {
  const blocks = ['# Selection Risk', `**Overall:** ${report.overallRisk}`]
  for (const [sev, group] of groupBySeverity(report.risks)) {   // markdown shows all four sections
    blocks.push([`## ${SEVERITY_LABEL[sev]}`, ...group.map((risk) => `- ${risk.reason}`)].join('\n'))
  }
  return blocks.join('\n\n')
}

/**
 * Summarize an M124 selection-risk report into a stable text representation.
 *
 * @param {object} riskReport  a result from `evaluateSelectionRisk` (M124)
 * @param {{ format?: ('line'|'text'|'markdown'|'json') }} [options]  default format: "line"
 * @returns {string}
 */
export function summarizeSelectionRisk(riskReport, options = {}) {
  assertRiskReport(riskReport)
  const format = (options && options.format !== undefined) ? options.format : 'line'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeSelectionRisk: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'line') return toLine(riskReport)
  if (format === 'text') return toText(riskReport)
  if (format === 'markdown') return toMarkdown(riskReport)
  return canonicalStringify(riskReport)   // format === 'json'
}
