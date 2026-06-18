/**
 * @brain/evidence-gateway — gate manifest signature verifier / verifyGateManifestSignature (M89, DORMANT)
 *
 * A pure, CRYPTO-AGNOSTIC attestation checker. It recomputes the M88 signing payload for an
 * M83 manifest and delegates the actual cryptographic check to an INJECTED `verifyFn` — it
 * imports and implements NO cryptography. All crypto stays external.
 *
 * Pure orchestration: reuses `gateManifestSigningPayload` (M88) for the payload (and thus
 * the M65 canonicalisation/digest — no new hashing). Reads only — no persistence,
 * filesystem, API, network, store, engine, clock or randomness. Inputs are never mutated;
 * the result is deeply frozen. If `verifyFn` throws, the error propagates unchanged.
 */

import { gateManifestSigningPayload } from './signing-payload.js'

/**
 * Verify a signature over a gate manifest's signing payload, using an injected verifier.
 *
 * @param {object} manifest   a valid M83 manifest (from `createGateManifest`)
 * @param {*} signature       the signature to check (opaque to this helper; must be provided)
 * @param {(payload: { canonical:string, pipelineDigest:string }, signature:*) => boolean} verifyFn
 *   the external crypto verifier; receives the M88 signing payload and the signature
 * @returns {Readonly<{ ok:boolean, pipelineDigest:string }>}
 */
export function verifyGateManifestSignature(manifest, signature, verifyFn) {
  // validates the manifest (throws TypeError if invalid) and yields { canonical, pipelineDigest }
  const payload = gateManifestSigningPayload(manifest)

  if (signature === undefined || signature === null) {
    throw new TypeError('verifyGateManifestSignature requires a signature')
  }
  if (typeof verifyFn !== 'function') {
    throw new TypeError('verifyGateManifestSignature requires verifyFn to be a function')
  }

  const ok = Boolean(verifyFn(payload, signature))   // verifyFn errors propagate unchanged
  return Object.freeze({ ok, pipelineDigest: payload.pipelineDigest })
}
