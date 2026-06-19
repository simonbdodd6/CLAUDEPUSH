/**
 * @brain/evidence-gateway — batch attestation envelope verifier / verifyAttestationEnvelopes (M93, DORMANT)
 *
 * A pure deterministic batch verifier: it coordinates multiple single-envelope
 * verifications by REUSING the M91 `verifyAttestationEnvelope` (no duplicated logic) and
 * folding the per-envelope results into an aggregate. It performs NO cryptography itself —
 * the injected `verifyFn` is forwarded to each single verification, keeping all crypto
 * external.
 *
 * Pure orchestration: preserves input order, no sorting, reads only — no persistence,
 * filesystem, API, network, store, engine, clock or randomness. Inputs are never mutated;
 * the aggregate (and the per-envelope results array) is frozen. A `verifyFn` that throws
 * propagates unchanged.
 */

import { verifyAttestationEnvelope } from './verify-envelope.js'

/**
 * Verify a batch of M90/M91 attestation envelopes with an injected verifier.
 *
 * @param {object[]} envelopes  attestation envelopes (M90), verified in order
 * @param {(payload: object, signature:*) => boolean} verifyFn  external crypto verifier
 * @returns {Readonly<{
 *   total:number, valid:number, invalid:number, allValid:boolean,
 *   results: ReadonlyArray<Readonly<{ ok:boolean, pipelineDigest:*, keyId?:*, algorithm?:* }>>
 * }>}
 */
export function verifyAttestationEnvelopes(envelopes, verifyFn) {
  if (!Array.isArray(envelopes)) {
    throw new TypeError('verifyAttestationEnvelopes requires envelopes to be an array')
  }
  if (typeof verifyFn !== 'function') {
    throw new TypeError('verifyAttestationEnvelopes requires verifyFn to be a function')
  }

  // reuse the M91 single-envelope verifier; preserve order, collect each result unchanged
  const results = envelopes.map((envelope) => verifyAttestationEnvelope(envelope, verifyFn))

  const total = results.length
  let valid = 0
  for (const r of results) if (r.ok) valid++
  const invalid = total - valid
  const allValid = invalid === 0

  return Object.freeze({
    total,
    valid,
    invalid,
    allValid,
    results: Object.freeze(results),
  })
}
