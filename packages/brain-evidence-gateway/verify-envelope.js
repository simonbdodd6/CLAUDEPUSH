/**
 * @brain/evidence-gateway — attestation envelope verifier / verifyAttestationEnvelope (M91, DORMANT)
 *
 * A pure, CRYPTO-AGNOSTIC checker for an M90 attestation envelope. It validates the
 * envelope shape and delegates the actual cryptographic check to an INJECTED `verifyFn`,
 * which receives the envelope's existing payload and signature. It imports and implements
 * NO cryptography — all crypto stays external.
 *
 * Unlike M89 it does NOT recreate the signing payload or run manifest verification — it
 * trusts the envelope's own `payload` as-is. Pure orchestration: reads only, no hashing,
 * no signing, no persistence, filesystem, API, network, store, engine, clock or randomness.
 * Inputs (envelope / payload / signature / metadata) are never mutated; the result is
 * frozen. If `verifyFn` throws, the error propagates unchanged.
 */

const isObj = (v) => v !== null && typeof v === 'object'

/**
 * Verify an M90 attestation envelope using an injected verifier.
 *
 * @param {{ payload: { pipelineDigest:string, canonical:string }, signature?:*, keyId?:*, algorithm?:* }} envelope
 * @param {(payload: object, signature:*) => boolean} verifyFn  external crypto verifier
 * @returns {Readonly<{ ok:boolean, pipelineDigest:*, keyId?:*, algorithm?:* }>}
 */
export function verifyAttestationEnvelope(envelope, verifyFn) {
  if (!isObj(envelope)) {
    throw new TypeError('verifyAttestationEnvelope requires an M90 attestation envelope object')
  }
  if (!isObj(envelope.payload)) {
    throw new TypeError('verifyAttestationEnvelope requires envelope.payload')
  }
  if (envelope.signature === undefined || envelope.signature === null) {
    throw new TypeError('verifyAttestationEnvelope requires envelope.signature')
  }
  if (typeof verifyFn !== 'function') {
    throw new TypeError('verifyAttestationEnvelope requires verifyFn to be a function')
  }

  const ok = Boolean(verifyFn(envelope.payload, envelope.signature))   // verifyFn errors propagate

  const result = { ok, pipelineDigest: envelope.payload.pipelineDigest }
  if (envelope.keyId !== undefined) result.keyId = envelope.keyId           // preserve falsy
  if (envelope.algorithm !== undefined) result.algorithm = envelope.algorithm

  return Object.freeze(result)
}
