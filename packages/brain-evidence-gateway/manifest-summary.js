/**
 * @brain/evidence-gateway — manifest index summary / summarizeManifestIndex (M97, DORMANT)
 *
 * A pure PRESENTATION layer for an M95 manifest index ({ total, unique, duplicates,
 * digests, entries }). It NEVER calculates new information beyond formatting the values
 * already in the index, and NEVER mutates it. Four formats:
 *   - "line"     → `manifest-index total=… unique=… duplicates=…` (default)
 *   - "text"     → a titled multi-line block
 *   - "markdown" → a Markdown heading + bullet list
 *   - "json"     → canonical, key-sorted JSON (reuses the M65 `canonicalStringify`, the
 *                  same convention used by previous summary milestones)
 *
 * Reads only — no persistence, filesystem, API, network, crypto, clock, randomness,
 * mutation or cloning.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['line', 'text', 'markdown', 'json'])
const isObj = (v) => v !== null && typeof v === 'object'

/** Minimal shape check for an M95 manifest index. */
function assertIndex(ix) {
  if (!isObj(ix) || typeof ix.total !== 'number' || typeof ix.unique !== 'number' ||
      typeof ix.duplicates !== 'number' || !Array.isArray(ix.digests) || !isObj(ix.entries)) {
    throw new TypeError('summarizeManifestIndex requires an M95 manifest index { total, unique, duplicates, digests, entries }')
  }
}

const toLine = (ix) => `manifest-index total=${ix.total} unique=${ix.unique} duplicates=${ix.duplicates}`

const toText = (ix) => [
  'Manifest Index',
  '',
  `Total manifests: ${ix.total}`,
  `Unique digests: ${ix.unique}`,
  `Duplicate manifests: ${ix.duplicates}`,
].join('\n')

const toMarkdown = (ix) => [
  '# Manifest Index',
  '',
  `- Total: ${ix.total}`,
  `- Unique digests: ${ix.unique}`,
  `- Duplicates: ${ix.duplicates}`,
].join('\n')

/**
 * Summarize an M95 manifest index into a stable text representation.
 *
 * @param {object} index  an index from `gateManifestIndex` (M95)
 * @param {{ format?: ('line'|'text'|'markdown'|'json') }} [options]  default format: "line"
 * @returns {string}
 */
export function summarizeManifestIndex(index, options = {}) {
  assertIndex(index)
  const format = (options && options.format !== undefined) ? options.format : 'line'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeManifestIndex: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'line') return toLine(index)
  if (format === 'text') return toText(index)
  if (format === 'markdown') return toMarkdown(index)
  return canonicalStringify(index)   // format === 'json'
}
