/**
 * @brain/evidence-gateway — gate manifest integrity verifier / verifyGateManifest (M87, DORMANT)
 *
 * A pure integrity check for M83 gate manifests: it recomputes the manifest's own
 * `pipelineDigest` from its payload (everything except `pipelineDigest`) and compares it to
 * the stored value — detecting tampering of a stored manifest. It REUSES the exact M65
 * approach createGateManifest used (`canonicalStringify` → `pipelineDigest`); it introduces
 * no new hashing system, does not call createGateManifest, and needs neither the original
 * gateCI result nor any rerun.
 *
 * Reads only — no store, engine, persistence, filesystem, API, network, clock or
 * randomness. The input is never mutated; the verdict is deeply frozen.
 */

import { canonicalStringify, pipelineDigest } from './snapshot.js'

const isObj = (v) => v !== null && typeof v === 'object'

/** Deterministic digest of any JSON value — the same M65 helpers used by createGateManifest. */
const digestOf = (value) => pipelineDigest(canonicalStringify(value))

/** Minimal shape check for an M83 manifest. */
function assertManifest(m) {
  if (!isObj(m) || typeof m.pipelineDigest !== 'string' ||
      !isObj(m.inputs) || !isObj(m.policy) || !isObj(m.outcome) ||
      !isObj(m.decision) || !isObj(m.report) || !isObj(m.artifacts)) {
    throw new TypeError('verifyGateManifest requires an M83 gate manifest object')
  }
}

/**
 * Verify an M83 gate manifest's self-digest.
 *
 * @param {object} manifest  a manifest from `createGateManifest` (M83)
 * @returns {Readonly<{ ok:boolean, expected:string, actual:string }>}
 *   expected = the stored `manifest.pipelineDigest`; actual = the digest recomputed from
 *   the payload (the manifest minus `pipelineDigest`); ok = expected === actual.
 */
export function verifyGateManifest(manifest) {
  assertManifest(manifest)

  // payload = the manifest minus its own pipelineDigest — identical to what M83 digested
  const { pipelineDigest: expected, ...payload } = manifest
  const actual = digestOf(payload)

  return Object.freeze({ ok: expected === actual, expected, actual })
}
