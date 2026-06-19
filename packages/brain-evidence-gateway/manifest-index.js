/**
 * @brain/evidence-gateway — gate manifest index / gateManifestIndex (M95, DORMANT)
 *
 * A deterministic lookup/index over MANY existing M83 manifests, for caching and retrieval
 * across runs. It is NOT verification, serialization, comparison, hashing, or digest
 * generation — it simply organises existing manifests by their existing `pipelineDigest`.
 *
 * Reuses only existing manifest fields (reads `pipelineDigest`); creates no digests, clones
 * nothing, and references the original manifest objects. Maintains first-seen order;
 * duplicate digests increase `count` only (the entry keeps the first occurrence's manifest
 * and firstIndex). Reads only — no persistence, filesystem, network, API, engine, clock,
 * randomness or crypto. Inputs are never mutated; the index is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object'

/** Validate one array element is an M83 manifest with a pipelineDigest. */
function assertManifest(m, i) {
  if (!isObj(m)) throw new TypeError(`gateManifestIndex: invalid manifest at index ${i}`)
  if (typeof m.pipelineDigest !== 'string') throw new TypeError(`gateManifestIndex: manifest at index ${i} is missing pipelineDigest`)
}

/**
 * Index an array of M83 manifests by `pipelineDigest`.
 *
 * @param {object[]} manifests  M83 manifests (from `createGateManifest`)
 * @returns {Readonly<{
 *   total:number, unique:number, duplicates:number,
 *   digests: ReadonlyArray<string>,
 *   entries: Readonly<Record<string, Readonly<{ count:number, firstIndex:number, manifest:object }>>>
 * }>}
 */
export function gateManifestIndex(manifests) {
  if (!Array.isArray(manifests)) {
    throw new TypeError('gateManifestIndex requires an array of manifests')
  }

  const digests = []          // first-appearance order, de-duplicated
  const entries = {}          // pipelineDigest -> { count, firstIndex, manifest }

  for (let i = 0; i < manifests.length; i++) {
    const m = manifests[i]
    assertManifest(m, i)
    const d = m.pipelineDigest
    if (Object.prototype.hasOwnProperty.call(entries, d)) {
      entries[d].count++                                          // duplicate: increase count only
    } else {
      entries[d] = { count: 1, firstIndex: i, manifest: m }       // first occurrence (reference, not clone)
      digests.push(d)
    }
  }

  const total = manifests.length
  const unique = digests.length

  // freeze the index structure (entry objects + arrays); referenced manifests are already
  // frozen by M83 and are intentionally not re-walked (they are referenced, not owned).
  for (const d of digests) Object.freeze(entries[d])

  return Object.freeze({
    total,
    unique,
    duplicates: total - unique,
    digests: Object.freeze(digests),
    entries: Object.freeze(entries),
  })
}
