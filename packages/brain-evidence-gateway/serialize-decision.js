/**
 * @brain/evidence-gateway — gate decision serializers / serializeGateDecision (M79, DORMANT)
 *
 * Pure deterministic serializers that render an M75 gate decision into stable text
 * representations, mirroring the M73 outcome serializers. Three formats:
 *   - "json"    → canonical, key-sorted JSON (reuses the M65 `canonicalStringify`)
 *   - "line"    → the decision's `line` verbatim (e.g. `policy=pass` / `policy=fail reasons=2 …`)
 *   - "reasons" → one reason per line; empty string when there are no reasons
 *
 * It REUSES the M75 decision fields and the existing canonicaliser only — no new policy /
 * gate / report logic and no hand-rolled JSON — and only READS its input (returns a
 * string; writes nothing). No store, engine, persistence, filesystem, API, network, clock
 * or randomness. The input decision is never mutated.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['json', 'line', 'reasons'])
const isObj = (v) => v !== null && typeof v === 'object'

/**
 * Serialize an M75 gate decision into a stable text representation.
 *
 * @param {object} decision  a decision from `decideGate` (M75)
 * @param {{ format?: ('json'|'line'|'reasons') }} [options]  default format: "json"
 * @returns {string}
 */
export function serializeGateDecision(decision, options = {}) {
  if (!isObj(decision)) {
    throw new TypeError('serializeGateDecision requires an M75 gate decision object')
  }
  const format = (options && options.format !== undefined) ? options.format : 'json'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`serializeGateDecision: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'json') {
    return canonicalStringify(decision)
  }

  if (format === 'line') {
    return String(decision.line)
  }

  // format === 'reasons'
  const reasons = Array.isArray(decision.reasons) ? decision.reasons : []
  return reasons.join('\n')
}
