/**
 * @brain/evidence-gateway — manifest comparison summary / summarizeManifestComparison (M86, DORMANT)
 *
 * Pure deterministic human/CI summaries of an M84 manifest comparison result. Four formats:
 *   - "line"     → compact one-line summary
 *   - "text"     → readable plain-text summary
 *   - "markdown" → deterministic Markdown
 *   - "json"     → canonical, key-sorted JSON (reuses the M65 `canonicalStringify`)
 *
 * It REUSES the M84 comparison fields only — no new comparison / manifest / gate logic and
 * no hand-rolled JSON — and only READS its input (returns a string; writes nothing).
 * caseChanges / artifactChanges are rendered in M84's existing deterministic order. No
 * store, engine, persistence, filesystem, API, network, clock or randomness. The input is
 * never mutated.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['line', 'text', 'markdown', 'json'])
const isObj = (v) => v !== null && typeof v === 'object'

/** Minimal shape check for an M84 comparison result. */
function assertComparison(c) {
  if (!isObj(c) || typeof c.identical !== 'boolean' || typeof c.pipelineDigestMatch !== 'boolean' ||
      !Array.isArray(c.changed) || !Array.isArray(c.caseChanges) || !Array.isArray(c.artifactChanges) ||
      typeof c.policyChanged !== 'boolean' || typeof c.outcomeChanged !== 'boolean' ||
      typeof c.decisionChanged !== 'boolean' || typeof c.reportChanged !== 'boolean') {
    throw new TypeError('summarizeManifestComparison requires an M84 manifest comparison object')
  }
}

function toLine(c) {
  const tokens = [
    'manifest-diff',
    `identical=${c.identical}`,
    `pipelineDigestMatch=${c.pipelineDigestMatch}`,
    `changed=${c.changed.length}`,
  ]
  if (c.changed.length > 0) tokens.push(`areas=${c.changed.join(',')}`)
  if (c.caseChanges.length > 0) tokens.push(`cases=${c.caseChanges.length}`)
  if (c.artifactChanges.length > 0) tokens.push(`artifacts=${c.artifactChanges.length}`)
  return tokens.join(' ')
}

function toText(c) {
  const lines = [
    'Manifest comparison',
    `identical: ${c.identical}`,
    `pipelineDigestMatch: ${c.pipelineDigestMatch}`,
    `changed areas: ${c.changed.length ? c.changed.join(', ') : 'none'}`,
    `policy: changed=${c.policyChanged}  outcome: changed=${c.outcomeChanged}  decision: changed=${c.decisionChanged}  report: changed=${c.reportChanged}`,
  ]
  if (c.caseChanges.length) {
    lines.push('', 'Case changes:')
    for (const cc of c.caseChanges) lines.push(`  - ${cc.name}: ${cc.status} (${cc.beforeDigest} -> ${cc.afterDigest})`)
  }
  if (c.artifactChanges.length) {
    lines.push('', 'Artifact changes:')
    for (const ac of c.artifactChanges) lines.push(`  - ${ac.name}: ${ac.beforeDigest} -> ${ac.afterDigest}`)
  }
  return lines.join('\n')
}

function toMarkdown(c) {
  const blocks = [
    '# Manifest Comparison',
    `**Identical:** ${c.identical}  **Pipeline digest match:** ${c.pipelineDigestMatch}`,
    `**Changed areas:** ${c.changed.length ? c.changed.join(', ') : 'none'}`,
    `**Flags:** policy=${c.policyChanged} outcome=${c.outcomeChanged} decision=${c.decisionChanged} report=${c.reportChanged}`,
  ]
  if (c.caseChanges.length) {
    const lines = ['## Case changes']
    for (const cc of c.caseChanges) lines.push(`- **${cc.name}** — ${cc.status} (\`${cc.beforeDigest}\` → \`${cc.afterDigest}\`)`)
    blocks.push(lines.join('\n'))
  }
  if (c.artifactChanges.length) {
    const lines = ['## Artifact changes']
    for (const ac of c.artifactChanges) lines.push(`- **${ac.name}** — \`${ac.beforeDigest}\` → \`${ac.afterDigest}\``)
    blocks.push(lines.join('\n'))
  }
  return blocks.join('\n\n')
}

/**
 * Summarize an M84 manifest comparison into a stable text representation.
 *
 * @param {object} comparison  a result from `compareGateManifests` (M84)
 * @param {{ format?: ('line'|'text'|'markdown'|'json') }} [options]  default format: "line"
 * @returns {string}
 */
export function summarizeManifestComparison(comparison, options = {}) {
  assertComparison(comparison)
  const format = (options && options.format !== undefined) ? options.format : 'line'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`summarizeManifestComparison: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'line') return toLine(comparison)
  if (format === 'text') return toText(comparison)
  if (format === 'markdown') return toMarkdown(comparison)
  return canonicalStringify(comparison)   // format === 'json'
}
