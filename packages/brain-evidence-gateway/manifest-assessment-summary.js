/**
 * @brain/evidence-gateway — manifest assessment summary / summarizeManifestAssessment (M104, DORMANT)
 *
 * A pure PRESENTATION layer for an M103 assessment ({ ok, verdict, reasons }). It formats an
 * existing assessment and computes nothing — it never modifies the assessment. Four formats:
 *   - "line"     → `manifest-assessment ok=… verdict=… reasons=…` (default)
 *   - "text"     → a titled block listing each reason as a bullet
 *   - "markdown" → a Markdown heading + a Reasons section
 *   - "json"     → canonical, key-sorted JSON of the assessment (reuses the M65
 *                  `canonicalStringify`, the same convention as previous summary milestones)
 *
 * Reads only — no mutation, cloning, recomputation, persistence, filesystem, API, network,
 * crypto, clock or randomness.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['line', 'text', 'markdown', 'json'])
const isObj = (v) => v !== null && typeof v === 'object'

/** Minimal shape check for an M103 assessment. */
function assertAssessment(a) {
  if (!isObj(a) || typeof a.ok !== 'boolean' || typeof a.verdict !== 'string' || !Array.isArray(a.reasons)) {
    throw new TypeError('summarizeManifestAssessment requires an M103 assessment { ok, verdict, reasons }')
  }
}

const toLine = (a) => `manifest-assessment ok=${a.ok} verdict=${a.verdict} reasons=${a.reasons.length}`

const toText = (a) => [
  'Manifest Assessment',
  `OK: ${a.ok}`,
  `Verdict: ${a.verdict}`,
  'Reasons:',
  ...a.reasons.map((r) => `- ${r}`),
].join('\n\n')

const toMarkdown = (a) => [
  '# Manifest Assessment',
  `- OK: ${a.ok}`,
  `- Verdict: ${a.verdict}`,
  '## Reasons',
  ...a.reasons.map((r) => `- ${r}`),
].join('\n\n')

/**
 * Summarize an M103 manifest assessment into a stable text representation.
 *
 * @param {object} assessment  a result from `assessManifestExplanation` (M103)
 * @param {{ format?: ('line'|'text'|'markdown'|'json') }} [options]  default format: "line"
 * @returns {string}
 */
export function summarizeManifestAssessment(assessment, options = {}) {
  assertAssessment(assessment)
  const format = (options && options.format !== undefined) ? options.format : 'line'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeManifestAssessment: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'line') return toLine(assessment)
  if (format === 'text') return toText(assessment)
  if (format === 'markdown') return toMarkdown(assessment)
  return canonicalStringify(assessment)   // format === 'json'
}
