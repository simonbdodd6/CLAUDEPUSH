/**
 * @brain/evidence-gateway — merge gate manifest indexes / mergeGateManifestIndexes (M98, DORMANT)
 *
 * Combines two M95-style manifest indexes into one WITHOUT rebuilding from raw manifests —
 * it folds the existing per-digest entries. For digests in both, counts are summed and the
 * first index's firstIndex/manifest are kept; for b-only digests, firstIndex is offset by
 * a.total (so positions stay consistent with `a` then `b`) and b's manifest is referenced.
 *
 * Reuses only existing index fields; clones no manifests (entry wrappers are new, but each
 * `manifest` is referenced as-is). Reads only — no persistence, filesystem, API, network,
 * crypto, clock, randomness, engine or side effects. Inputs are never mutated; the returned
 * index is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object'
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k)

/** Validate one M95 index (shape + every listed digest's entry). */
function assertIndex(ix, label) {
  if (!isObj(ix) || typeof ix.total !== 'number' || typeof ix.unique !== 'number' ||
      typeof ix.duplicates !== 'number' || !Array.isArray(ix.digests) || !isObj(ix.entries)) {
    throw new TypeError(`mergeGateManifestIndexes: index ${label} is not a valid M95 index`)
  }
  for (const d of ix.digests) {
    if (!has(ix.entries, d) || !isObj(ix.entries[d])) {
      throw new TypeError(`mergeGateManifestIndexes: index ${label} lists digest "${d}" with no entry`)
    }
    const e = ix.entries[d]
    if (typeof e.count !== 'number') throw new TypeError(`mergeGateManifestIndexes: index ${label} entry "${d}" is missing a numeric count`)
    if (typeof e.firstIndex !== 'number') throw new TypeError(`mergeGateManifestIndexes: index ${label} entry "${d}" is missing a numeric firstIndex`)
    if (e.manifest === undefined || e.manifest === null) throw new TypeError(`mergeGateManifestIndexes: index ${label} entry "${d}" is missing a manifest`)
  }
}

/**
 * Merge two M95 manifest indexes into one deeply-frozen index.
 *
 * @param {object} a  an M95 index (from `gateManifestIndex`)
 * @param {object} b  an M95 index
 * @returns {Readonly<{ total:number, unique:number, duplicates:number,
 *   digests: ReadonlyArray<string>,
 *   entries: Readonly<Record<string, Readonly<{ count:number, firstIndex:number, manifest:object }>>> }>}
 */
export function mergeGateManifestIndexes(a, b) {
  assertIndex(a, 'a')
  assertIndex(b, 'b')

  const digests = [...a.digests]
  const entries = {}

  // a's digests (already unique, first-seen order) — sum overlaps, keep a's firstIndex/manifest
  for (const d of a.digests) {
    const ae = a.entries[d]
    const count = has(b.entries, d) ? ae.count + b.entries[d].count : ae.count
    entries[d] = Object.freeze({ count, firstIndex: ae.firstIndex, manifest: ae.manifest })
  }

  // b-only digests appended in b's order; firstIndex offset by a.total, b's manifest referenced
  for (const d of b.digests) {
    if (has(a.entries, d)) continue
    const be = b.entries[d]
    digests.push(d)
    entries[d] = Object.freeze({ count: be.count, firstIndex: a.total + be.firstIndex, manifest: be.manifest })
  }

  const total = a.total + b.total
  const unique = digests.length

  return Object.freeze({
    total,
    unique,
    duplicates: total - unique,
    digests: Object.freeze(digests),
    entries: Object.freeze(entries),
  })
}
