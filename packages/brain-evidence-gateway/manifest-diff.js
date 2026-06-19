/**
 * @brain/evidence-gateway — diff manifest indexes / diffManifestIndexes (M100, DORMANT)
 *
 * Compares two M95-style manifest indexes — "what changed between two sets of manifests?" —
 * WITHOUT touching raw manifests. It reads only `digests`, `entries`, and per-entry `count`;
 * it never compares manifest contents.
 *
 * Returns a deeply-frozen { added, removed, changed, unchanged, summary }: digests only in
 * current (added), only in previous (removed), present in both with a differing count
 * (changed → { pipelineDigest, previousCount, currentCount }), and present in both with an
 * identical count (unchanged). Orderings are deterministic: added in current order, removed
 * in previous order, changed/unchanged in previous order.
 *
 * Reads only — no clone, no mutation, no persistence, filesystem, API, network, crypto,
 * clock, randomness or engine. Output is deeply frozen.
 */

const isObj = (v) => v !== null && typeof v === 'object'
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k)

/** Validate one M95 index (shape + every listed digest's entry count). */
function assertIndex(ix, label) {
  if (!isObj(ix) || typeof ix.total !== 'number' || typeof ix.unique !== 'number' ||
      typeof ix.duplicates !== 'number' || !Array.isArray(ix.digests) || !isObj(ix.entries)) {
    throw new TypeError(`diffManifestIndexes: ${label} is not a valid M95 manifest index`)
  }
  for (const d of ix.digests) {
    if (!has(ix.entries, d) || !isObj(ix.entries[d])) {
      throw new TypeError(`diffManifestIndexes: ${label} lists digest "${d}" with no entry`)
    }
    if (typeof ix.entries[d].count !== 'number') {
      throw new TypeError(`diffManifestIndexes: ${label} entry "${d}" is missing a numeric count`)
    }
  }
}

/**
 * Diff two M95 manifest indexes (previous → current).
 *
 * @param {object} previousIndex  an M95 index (from `gateManifestIndex`)
 * @param {object} currentIndex   an M95 index
 * @returns {Readonly<{
 *   added: ReadonlyArray<string>, removed: ReadonlyArray<string>,
 *   changed: ReadonlyArray<Readonly<{ pipelineDigest:string, previousCount:number, currentCount:number }>>,
 *   unchanged: ReadonlyArray<string>,
 *   summary: Readonly<{ previousUnique:number, currentUnique:number, added:number, removed:number, changed:number, unchanged:number }>
 * }>}
 */
export function diffManifestIndexes(previousIndex, currentIndex) {
  assertIndex(previousIndex, 'previousIndex')
  assertIndex(currentIndex, 'currentIndex')

  const prevEntries = previousIndex.entries
  const currEntries = currentIndex.entries

  // added — in current only (current order)
  const added = currentIndex.digests.filter((d) => !has(prevEntries, d))

  // removed — in previous only (previous order)
  const removed = previousIndex.digests.filter((d) => !has(currEntries, d))

  // changed / unchanged — present in both (previous order)
  const changed = []
  const unchanged = []
  for (const d of previousIndex.digests) {
    if (!has(currEntries, d)) continue
    const previousCount = prevEntries[d].count
    const currentCount = currEntries[d].count
    if (previousCount !== currentCount) {
      changed.push(Object.freeze({ pipelineDigest: d, previousCount, currentCount }))
    } else {
      unchanged.push(d)
    }
  }

  const summary = Object.freeze({
    previousUnique: previousIndex.digests.length,
    currentUnique: currentIndex.digests.length,
    added: added.length,
    removed: removed.length,
    changed: changed.length,
    unchanged: unchanged.length,
  })

  return Object.freeze({
    added: Object.freeze(added),
    removed: Object.freeze(removed),
    changed: Object.freeze(changed),
    unchanged: Object.freeze(unchanged),
    summary,
  })
}
