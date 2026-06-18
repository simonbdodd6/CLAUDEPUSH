/**
 * @brain/evidence-gateway — gate manifest serializers / serializeGateManifest (M85, DORMANT)
 *
 * Pure deterministic serializers that render an M83 gate manifest into stable text
 * representations, completing serialization symmetry across every gate artifact (report
 * M81, outcome M73, decision M79, manifest M85). Two formats:
 *   - "json" → canonical, key-sorted JSON (reuses the M65 `canonicalStringify`)
 *   - "line" → a compact one-line summary built from existing manifest fields only;
 *              any missing optional field's token is omitted cleanly
 *
 * It REUSES the M83 manifest fields and the existing canonicaliser only — no new manifest,
 * digesting, comparison, gate, report, policy, decision or evidence logic, and no
 * hand-rolled JSON — and only READS its input (returns a string; writes nothing). No
 * store, engine, persistence, filesystem, API, network, clock or randomness. The input
 * manifest is never mutated.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['json', 'line'])
const isObj = (v) => v !== null && typeof v === 'object'

/** Compact one-line summary from existing manifest fields; missing tokens are omitted. */
function toLine(manifest) {
  const tokens = ['manifest']
  if (typeof manifest.pipelineDigest === 'string') tokens.push(`pipelineDigest=${manifest.pipelineDigest}`)
  if (isObj(manifest.inputs) && typeof manifest.inputs.caseCount === 'number') tokens.push(`cases=${manifest.inputs.caseCount}`)
  if (isObj(manifest.outcome) && typeof manifest.outcome.status === 'string') tokens.push(`status=${manifest.outcome.status}`)
  if (isObj(manifest.decision) && typeof manifest.decision.exitCode === 'number') tokens.push(`exit=${manifest.decision.exitCode}`)
  return tokens.join(' ')
}

/**
 * Serialize an M83 gate manifest into a stable text representation.
 *
 * @param {object} manifest  a manifest from `createGateManifest` (M83)
 * @param {{ format?: ('json'|'line') }} [options]  default format: "json"
 * @returns {string}
 */
export function serializeGateManifest(manifest, options = {}) {
  if (!isObj(manifest)) {
    throw new TypeError('serializeGateManifest requires an M83 gate manifest object')
  }
  const format = (options && options.format !== undefined) ? options.format : 'json'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`serializeGateManifest: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'json') return canonicalStringify(manifest)
  return toLine(manifest)   // format === 'line'
}
