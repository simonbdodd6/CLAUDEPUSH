/**
 * @brain/evidence-gateway — gate manifest lookup / lookupGateManifest (M96, DORMANT)
 *
 * A tiny pure accessor over an M95 manifest index. It returns the existing frozen entry
 * ({ count, firstIndex, manifest }) for a `pipelineDigest`, or null when the digest is
 * valid but absent. It does NOT clone the entry or the manifest — object identity is
 * preserved — and it mutates nothing.
 *
 * Reads only: no persistence, filesystem, network, API, engine, clock, randomness, crypto
 * or side effects.
 */

const isObj = (v) => v !== null && typeof v === 'object'

/**
 * Look up a manifest index entry by `pipelineDigest`.
 *
 * @param {object} index           an index from `gateManifestIndex` (M95)
 * @param {string} pipelineDigest  the digest to look up (non-empty string)
 * @returns {Readonly<{ count:number, firstIndex:number, manifest:object }> | null}
 *   the existing frozen entry (same reference), or null if absent.
 */
export function lookupGateManifest(index, pipelineDigest) {
  if (!isObj(index)) {
    throw new TypeError('lookupGateManifest requires an index object')
  }
  if (!isObj(index.entries)) {
    throw new TypeError('lookupGateManifest requires index.entries to be an object')
  }
  if (typeof pipelineDigest !== 'string' || pipelineDigest.length === 0) {
    throw new TypeError('lookupGateManifest requires a non-empty string pipelineDigest')
  }

  return Object.prototype.hasOwnProperty.call(index.entries, pipelineDigest)
    ? index.entries[pipelineDigest]   // existing frozen entry; identity preserved, not cloned
    : null
}
