/**
 * @brain/evidence-gateway — filter manifest index / filterManifestIndex (M99, DORMANT)
 *
 * Derives a NEW M95-style manifest index containing only the entries whose
 * (pipelineDigest, entry) satisfy an injected predicate. The original index is never
 * changed. Digest ordering is preserved; manifest references are carried through (no
 * clone); entry wrappers are newly built; and `total` / `unique` / `duplicates` are
 * recomputed over the retained entries only (total = sum of retained counts).
 *
 * Reads only — no persistence, filesystem, API, network, crypto, clock, randomness, engine
 * or side effects. The input is never mutated; the returned index is deeply frozen. If the
 * predicate throws, the original error propagates unchanged.
 */

const isObj = (v) => v !== null && typeof v === 'object'
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k)

/** Validate one M95 index (shape + every listed digest's entry). */
function assertIndex(ix) {
  if (!isObj(ix) || typeof ix.total !== 'number' || typeof ix.unique !== 'number' ||
      typeof ix.duplicates !== 'number' || !Array.isArray(ix.digests) || !isObj(ix.entries)) {
    throw new TypeError('filterManifestIndex requires an M95 manifest index { total, unique, duplicates, digests, entries }')
  }
  for (const d of ix.digests) {
    if (!has(ix.entries, d) || !isObj(ix.entries[d])) {
      throw new TypeError(`filterManifestIndex: digest "${d}" is listed with no entry`)
    }
    const e = ix.entries[d]
    if (typeof e.count !== 'number') throw new TypeError(`filterManifestIndex: entry "${d}" is missing a numeric count`)
    if (typeof e.firstIndex !== 'number') throw new TypeError(`filterManifestIndex: entry "${d}" is missing a numeric firstIndex`)
    if (e.manifest === undefined || e.manifest === null) throw new TypeError(`filterManifestIndex: entry "${d}" is missing a manifest`)
  }
}

/**
 * Filter an M95 manifest index by a predicate over (pipelineDigest, entry).
 *
 * @param {object} index  an M95 index (from `gateManifestIndex`)
 * @param {(pipelineDigest:string, entry:{ count:number, firstIndex:number, manifest:object }) => boolean} predicate
 * @returns {Readonly<{ total:number, unique:number, duplicates:number,
 *   digests: ReadonlyArray<string>,
 *   entries: Readonly<Record<string, Readonly<{ count:number, firstIndex:number, manifest:object }>>> }>}
 */
export function filterManifestIndex(index, predicate) {
  assertIndex(index)
  if (typeof predicate !== 'function') {
    throw new TypeError('filterManifestIndex requires predicate to be a function')
  }

  const digests = []
  const entries = {}
  let total = 0

  for (const d of index.digests) {
    const e = index.entries[d]
    if (predicate(d, e)) {                                   // predicate errors propagate unchanged
      digests.push(d)
      entries[d] = Object.freeze({ count: e.count, firstIndex: e.firstIndex, manifest: e.manifest })
      total += e.count
    }
  }

  const unique = digests.length

  return Object.freeze({
    total,
    unique,
    duplicates: total - unique,
    digests: Object.freeze(digests),
    entries: Object.freeze(entries),
  })
}
