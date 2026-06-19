/**
 * @brain/evidence-gateway — manifest diff summary / summarizeManifestDiff (M101, DORMANT)
 *
 * A pure PRESENTATION layer for an M100 manifest diff
 * ({ added, removed, changed, unchanged, summary }). It formats an existing diff and
 * computes nothing — it reads the counts already in `diff.summary` (no recomputation) and
 * never modifies the diff. Four formats:
 *   - "line"     → `manifest-diff added=… removed=… changed=… unchanged=…` (default)
 *   - "text"     → a titled block
 *   - "markdown" → a Markdown heading + bullets
 *   - "json"     → canonical, key-sorted JSON of the whole diff (reuses the M65
 *                  `canonicalStringify`, the same convention as previous summary milestones)
 *
 * Reads only — no mutation, cloning, recomputation, persistence, filesystem, API, network,
 * crypto, clock or randomness.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['line', 'text', 'markdown', 'json'])
const isObj = (v) => v !== null && typeof v === 'object'

/** Minimal shape check for an M100 diff. */
function assertDiff(diff) {
  if (!isObj(diff) || !Array.isArray(diff.added) || !Array.isArray(diff.removed) ||
      !Array.isArray(diff.changed) || !Array.isArray(diff.unchanged) || !isObj(diff.summary)) {
    throw new TypeError('summarizeManifestDiff requires an M100 manifest diff { added, removed, changed, unchanged, summary }')
  }
  const s = diff.summary
  if (typeof s.added !== 'number' || typeof s.removed !== 'number' ||
      typeof s.changed !== 'number' || typeof s.unchanged !== 'number') {
    throw new TypeError('summarizeManifestDiff requires numeric summary counts (added, removed, changed, unchanged)')
  }
}

const toLine = (s) => `manifest-diff added=${s.added} removed=${s.removed} changed=${s.changed} unchanged=${s.unchanged}`

const toText = (s) => [
  'Manifest Diff',
  `Added: ${s.added}`,
  `Removed: ${s.removed}`,
  `Changed: ${s.changed}`,
  `Unchanged: ${s.unchanged}`,
].join('\n\n')

const toMarkdown = (s) => [
  '# Manifest Diff',
  `- Added: ${s.added}`,
  `- Removed: ${s.removed}`,
  `- Changed: ${s.changed}`,
  `- Unchanged: ${s.unchanged}`,
].join('\n\n')

/**
 * Summarize an M100 manifest diff into a stable text representation.
 *
 * @param {object} diff  a result from `diffManifestIndexes` (M100)
 * @param {{ format?: ('line'|'text'|'markdown'|'json') }} [options]  default format: "line"
 * @returns {string}
 */
export function summarizeManifestDiff(diff, options = {}) {
  assertDiff(diff)
  const format = (options && options.format !== undefined) ? options.format : 'line'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeManifestDiff: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'line') return toLine(diff.summary)
  if (format === 'text') return toText(diff.summary)
  if (format === 'markdown') return toMarkdown(diff.summary)
  return canonicalStringify(diff)   // format === 'json'
}
