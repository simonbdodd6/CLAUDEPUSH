/**
 * @brain/evidence-gateway — explain manifest diff / explainManifestDiff (M102, DORMANT)
 *
 * The first explanation layer over an M100 manifest diff. It does NOT compare manifests or
 * recompute the diff — it explains an EXISTING diff in a deterministic, structured form.
 *
 * Returns a deeply-frozen { verdict, summary, statements }:
 *   - verdict   — one of no-change / additions-only / removals-only / changes-only / mixed
 *   - summary   — the existing `diff.summary` object, reused unmodified
 *   - statements — a deterministic ordered array: added digests, then removed, then changed,
 *                  then a final overall statement; wording is fixed (no invented phrasing).
 *
 * Reads only — no manifest inspection, mutation, persistence, filesystem, API, network,
 * crypto, clock or randomness.
 */

const isObj = (v) => v !== null && typeof v === 'object'

/** Minimal shape check for an M100 diff. */
function assertDiff(diff) {
  if (!isObj(diff) || !Array.isArray(diff.added) || !Array.isArray(diff.removed) ||
      !Array.isArray(diff.changed) || !Array.isArray(diff.unchanged) || !isObj(diff.summary)) {
    throw new TypeError('explainManifestDiff requires an M100 manifest diff { added, removed, changed, unchanged, summary }')
  }
  const s = diff.summary
  if (typeof s.added !== 'number' || typeof s.removed !== 'number' ||
      typeof s.changed !== 'number' || typeof s.unchanged !== 'number') {
    throw new TypeError('explainManifestDiff requires numeric summary counts (added, removed, changed, unchanged)')
  }
}

/** Derive the single-word verdict from the diff's category counts. */
function deriveVerdict(s) {
  const nonEmpty = (s.added > 0 ? 1 : 0) + (s.removed > 0 ? 1 : 0) + (s.changed > 0 ? 1 : 0)
  if (nonEmpty === 0) return 'no-change'
  if (nonEmpty > 1) return 'mixed'
  if (s.added > 0) return 'additions-only'
  if (s.removed > 0) return 'removals-only'
  return 'changes-only'
}

/**
 * Explain an M100 manifest diff in a deterministic, structured form.
 *
 * @param {object} diff  a result from `diffManifestIndexes` (M100)
 * @returns {Readonly<{ verdict:string, summary:object, statements:ReadonlyArray<string> }>}
 */
export function explainManifestDiff(diff) {
  assertDiff(diff)

  const statements = []
  for (const d of diff.added) statements.push(`Digest ${d} was added.`)
  for (const d of diff.removed) statements.push(`Digest ${d} was removed.`)
  for (const c of diff.changed) statements.push(`Digest ${c.pipelineDigest} changed count from ${c.previousCount} to ${c.currentCount}.`)
  statements.push('No further manifest changes detected.')

  return Object.freeze({
    verdict: deriveVerdict(diff.summary),
    summary: diff.summary,                  // reused unmodified (already frozen by M100)
    statements: Object.freeze(statements),
  })
}
