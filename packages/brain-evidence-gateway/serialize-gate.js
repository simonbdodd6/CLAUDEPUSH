/**
 * @brain/evidence-gateway — gate outcome serializers / serializeGateOutcome (M73, DORMANT)
 *
 * Pure deterministic serializers that render an M72 gate outcome into stable text
 * representations for CI systems, logs, GitHub Actions, and automated pipelines. Three
 * formats:
 *   - "json"        → canonical, key-sorted JSON (reuses the M65 `canonicalStringify`)
 *   - "line"        → the M72 `statusLine` verbatim
 *   - "annotations" → one `stage<TAB>path<TAB>caseName` row per emitted annotation, with a
 *                     single trailing "... N more" line when annotations overflow
 *
 * It REUSES the M72 outcome fields and the existing canonicaliser only — no new gate or
 * formatting logic — and only READS its input (returns a string; writes nothing). No
 * store, engine, persistence, filesystem, API, network, clock or randomness. The input
 * outcome is never mutated.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['json', 'line', 'annotations'])
const isObj = (v) => v !== null && typeof v === 'object'

/**
 * Serialize an M72 gate outcome into a stable text representation.
 *
 * @param {object} outcome  an outcome from `emitGateOutcome` (M72)
 * @param {{ format?: ('json'|'line'|'annotations') }} [options]  default format: "json"
 * @returns {string}
 */
export function serializeGateOutcome(outcome, options = {}) {
  if (!isObj(outcome)) {
    throw new TypeError('serializeGateOutcome requires an M72 gate outcome object')
  }
  const format = (options && options.format !== undefined) ? options.format : 'json'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`serializeGateOutcome: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'json') {
    return canonicalStringify(outcome)
  }

  if (format === 'line') {
    return String(outcome.statusLine)
  }

  // format === 'annotations'
  const annotations = Array.isArray(outcome.annotations) ? outcome.annotations : []
  const lines = annotations.map((a) => `${a.stage}\t${a.path}\t${a.caseName}`)
  const overflow = typeof outcome.overflow === 'number' ? outcome.overflow : 0
  if (overflow > 0) lines.push(`... ${overflow} more`)
  return lines.join('\n')
}
