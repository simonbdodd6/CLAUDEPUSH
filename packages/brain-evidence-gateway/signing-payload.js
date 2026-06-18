/**
 * @brain/evidence-gateway — gate manifest signing payload / gateManifestSigningPayload (M88, DORMANT)
 *
 * Pure groundwork for FUTURE attestation/signing: it exposes the exact deterministic
 * payload that a signer would later sign for an M83 gate manifest — the canonical JSON of
 * the manifest's payload (the manifest minus its own `pipelineDigest`) plus that payload's
 * digest. It performs NO crypto and NO real signing.
 *
 * It REUSES the exact M65 approach that createGateManifest (M83) and verifyGateManifest
 * (M87) use (`canonicalStringify` → `pipelineDigest`) — no second canonicalisation or
 * hashing system. By construction the returned `pipelineDigest` equals
 * `verifyGateManifest(manifest).actual` for the same manifest, and `canonical` excludes the
 * manifest's own `pipelineDigest` field. Reads only — no filesystem, persistence, store,
 * engine, clock or randomness. The input is never mutated; the output is frozen.
 */

import { canonicalStringify, pipelineDigest } from './snapshot.js'

const isObj = (v) => v !== null && typeof v === 'object'

/** Minimal shape check for an M83 manifest (matches the M87 verifier). */
function assertManifest(m) {
  if (!isObj(m) || typeof m.pipelineDigest !== 'string' ||
      !isObj(m.inputs) || !isObj(m.policy) || !isObj(m.outcome) ||
      !isObj(m.decision) || !isObj(m.report) || !isObj(m.artifacts)) {
    throw new TypeError('gateManifestSigningPayload requires an M83 gate manifest object')
  }
}

/**
 * Expose the deterministic signing payload for an M83 gate manifest.
 *
 * @param {object} manifest  a manifest from `createGateManifest` (M83)
 * @returns {Readonly<{ pipelineDigest:string, canonical:string }>}
 *   canonical = the canonical JSON of the manifest payload (excluding `pipelineDigest`);
 *   pipelineDigest = the digest of that canonical payload (== verifyGateManifest().actual).
 */
export function gateManifestSigningPayload(manifest) {
  assertManifest(manifest)

  // payload = the manifest minus its own pipelineDigest — identical to M83/M87
  const { pipelineDigest: _stored, ...payload } = manifest
  const canonical = canonicalStringify(payload)
  const digest = pipelineDigest(canonical)

  return Object.freeze({ pipelineDigest: digest, canonical })
}
