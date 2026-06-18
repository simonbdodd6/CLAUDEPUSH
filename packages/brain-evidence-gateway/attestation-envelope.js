/**
 * @brain/evidence-gateway — attestation envelope / attestationEnvelope (M90, DORMANT)
 *
 * A transport/presentation container that packages an M88 signing payload together with
 * EXTERNALLY-SUPPLIED signature metadata (signature / keyId / algorithm). It does NO
 * signing, verification, hashing, manifest creation, or digest generation beyond M88 — it
 * only assembles a frozen envelope ready for storage or transport.
 *
 * The payload always comes from `gateManifestSigningPayload` (M88). The signature / keyId /
 * algorithm are optional and copied verbatim when supplied: a field is omitted only when
 * its value is `undefined`, so explicit falsy values ('' / false / 0) are preserved and no
 * defaults are invented. Reads only — no crypto, timestamps, UUIDs, filesystem,
 * persistence, engine, randomness, environment, API or network. Inputs are never mutated;
 * the envelope container is frozen (its payload is already frozen by M88; supplied metadata
 * is held by reference, never re-frozen, so caller objects are untouched).
 */

import { gateManifestSigningPayload } from './signing-payload.js'

/**
 * Package an M83 manifest's M88 signing payload with optional signature metadata.
 *
 * @param {object} manifest  a valid M83 manifest (from `createGateManifest`)
 * @param {{ signature?:*, keyId?:*, algorithm?:* }} [options]
 *   signature / keyId / algorithm — optional, externally supplied; copied verbatim.
 * @returns {Readonly<{ payload: { pipelineDigest:string, canonical:string }, signature?:*, keyId?:*, algorithm?:* }>}
 */
export function attestationEnvelope(manifest, options = {}) {
  // payload always comes from M88 (validates the manifest; throws TypeError if invalid)
  const payload = gateManifestSigningPayload(manifest)

  const { signature, keyId, algorithm } = options || {}

  const envelope = { payload }
  if (signature !== undefined) envelope.signature = signature
  if (keyId !== undefined) envelope.keyId = keyId
  if (algorithm !== undefined) envelope.algorithm = algorithm

  return Object.freeze(envelope)
}
