/**
 * @brain/evidence-gateway — attestation envelope serializers / serializeAttestationEnvelope (M92, DORMANT)
 *
 * Pure deterministic serializers that render an M90/M91 attestation envelope into stable
 * text representations, completing serializer symmetry for every gate artifact (report
 * M81, outcome M73, decision M79, manifest M85, manifest-comparison M86, envelope M92).
 * Two formats:
 *   - "json" → canonical, key-sorted JSON (reuses the M65 `canonicalStringify`)
 *   - "line" → a compact one-line summary built from existing envelope fields only;
 *              absent optional fields (keyId / algorithm) are omitted cleanly
 *
 * It REUSES the envelope fields and the existing canonicaliser only — no new envelope /
 * crypto / hashing logic and no hand-rolled JSON — and only READS its input (returns a
 * string; writes nothing). No store, engine, persistence, filesystem, API, network, clock
 * or randomness. The input envelope is never mutated.
 */

import { canonicalStringify } from './snapshot.js'

const SUPPORTED_FORMATS = Object.freeze(['json', 'line'])
const isObj = (v) => v !== null && typeof v === 'object'

/** `signed` rule: true iff a signature is present (not undefined/null). */
const isSigned = (envelope) => envelope.signature !== undefined && envelope.signature !== null

/** Compact one-line summary from existing envelope fields; absent optional tokens omitted. */
function toLine(envelope) {
  const tokens = ['attestation', `pipelineDigest=${envelope.payload.pipelineDigest}`]
  if (envelope.keyId !== undefined) tokens.push(`keyId=${envelope.keyId}`)            // preserve falsy
  if (envelope.algorithm !== undefined) tokens.push(`algorithm=${envelope.algorithm}`)
  tokens.push(`signed=${isSigned(envelope)}`)
  return tokens.join(' ')
}

/**
 * Serialize an M90/M91 attestation envelope into a stable text representation.
 *
 * @param {object} envelope  an envelope from `attestationEnvelope` (M90)
 * @param {{ format?: ('json'|'line') }} [options]  default format: "json"
 * @returns {string}
 */
export function serializeAttestationEnvelope(envelope, options = {}) {
  if (!isObj(envelope) || !isObj(envelope.payload)) {
    throw new TypeError('serializeAttestationEnvelope requires an attestation envelope with a payload')
  }
  const format = (options && options.format !== undefined) ? options.format : 'json'
  if (!SUPPORTED_FORMATS.includes(format)) {
    throw new TypeError(`serializeAttestationEnvelope: unknown format "${format}" (expected one of: ${SUPPORTED_FORMATS.join(', ')})`)
  }

  if (format === 'json') return canonicalStringify(envelope)
  return toLine(envelope)   // format === 'line'
}
