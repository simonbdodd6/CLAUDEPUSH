/**
 * @brain/evidence-gateway — attestation batch summary / summarizeAttestationBatch (M94, DORMANT)
 *
 * A pure PRESENTATION helper that summarizes an M93 batch-verification result
 * ({ total, valid, invalid, allValid, results }). It performs NO verification, crypto,
 * filesystem, persistence, network, API, engine, clock or randomness — it only formats the
 * values already present in the batch result. Four formats:
 *   - "json"     → canonical, key-sorted JSON (reuses the M65 `canonicalStringify`)
 *   - "line"     → `attestation-batch total=… valid=… invalid=… allValid=…`
 *   - "text"     → human-readable multi-line block
 *   - "markdown" → a Markdown heading + metrics table
 *
 * Reads only; the input is never mutated. It does not inspect individual envelope contents
 * beyond the counts already in the batch result.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['json', 'line', 'text', 'markdown'])
const isObj = (v) => v !== null && typeof v === 'object'
const yesNo = (b) => (b ? 'Yes' : 'No')

/** Minimal shape check for an M93 batch result. */
function assertBatch(b) {
  if (!isObj(b) || typeof b.total !== 'number' || typeof b.valid !== 'number' ||
      typeof b.invalid !== 'number' || typeof b.allValid !== 'boolean' || !Array.isArray(b.results)) {
    throw new TypeError('summarizeAttestationBatch requires an M93 batch result { total, valid, invalid, allValid, results }')
  }
}

function toLine(b) {
  return `attestation-batch total=${b.total} valid=${b.valid} invalid=${b.invalid} allValid=${b.allValid}`
}

function toText(b) {
  const heading = 'Attestation Batch'
  return [
    heading,
    '-'.repeat(heading.length),
    `Total: ${b.total}`,
    `Valid: ${b.valid}`,
    `Invalid: ${b.invalid}`,
    `All Valid: ${yesNo(b.allValid)}`,
  ].join('\n')
}

function toMarkdown(b) {
  return [
    '# Attestation Batch',
    '',
    '| Metric | Value |',
    '|--------|------:|',
    `| Total | ${b.total} |`,
    `| Valid | ${b.valid} |`,
    `| Invalid | ${b.invalid} |`,
    `| All Valid | ${yesNo(b.allValid)} |`,
  ].join('\n')
}

/**
 * Summarize an M93 attestation batch result into a stable text representation.
 *
 * @param {object} batchResult  a result from `verifyAttestationEnvelopes` (M93)
 * @param {{ format?: ('json'|'line'|'text'|'markdown') }} [options]  default format: "json"
 * @returns {string}
 */
export function summarizeAttestationBatch(batchResult, options = {}) {
  assertBatch(batchResult)
  const format = (options && options.format !== undefined) ? options.format : 'json'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeAttestationBatch: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'json') return canonicalStringify(batchResult)
  if (format === 'line') return toLine(batchResult)
  if (format === 'text') return toText(batchResult)
  return toMarkdown(batchResult)   // format === 'markdown'
}
