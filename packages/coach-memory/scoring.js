/**
 * @coach-memory — Coach Memory scoring (M108, DORMANT)
 *
 * A pure deterministic relevance/quality score for a coach memory entry. It is plain
 * arithmetic over the entry's own fields — no persistence, engine, clock or randomness.
 * Scoring does not enforce the [0,1] domain of confidence/weight (that is the model's
 * validation job); it simply computes and clamps the resulting score into [0,1].
 */

const isObj = (v) => v !== null && typeof v === 'object'
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const clamp01 = (x) => Math.min(1, Math.max(0, x))

/**
 * Score a coach memory entry.
 *
 *   score = clamp01(
 *     confidence * 0.5
 *     + weight * 0.3
 *     + min(evidenceRefs.length, 5) / 5 * 0.1
 *     + min(ontologyLinks.length, 5) / 5 * 0.05
 *     + min(tags.length, 5) / 5 * 0.05
 *   )
 *
 * @param {object} entry
 * @returns {Readonly<{ score:number, confidence:number, weight:number,
 *   evidenceCount:number, ontologyLinkCount:number, tagCount:number }>}
 */
export function scoreCoachMemoryEntry(entry) {
  if (!isObj(entry) || Array.isArray(entry)) throw new TypeError('scoreCoachMemoryEntry requires an entry object')
  if (!isFiniteNumber(entry.confidence)) throw new TypeError('scoreCoachMemoryEntry requires a numeric confidence')
  if (!isFiniteNumber(entry.weight)) throw new TypeError('scoreCoachMemoryEntry requires a numeric weight')
  if (!Array.isArray(entry.evidenceRefs)) throw new TypeError('scoreCoachMemoryEntry requires evidenceRefs array')
  if (!Array.isArray(entry.ontologyLinks)) throw new TypeError('scoreCoachMemoryEntry requires ontologyLinks array')
  if (!Array.isArray(entry.tags)) throw new TypeError('scoreCoachMemoryEntry requires tags array')

  const evidenceCount = entry.evidenceRefs.length
  const ontologyLinkCount = entry.ontologyLinks.length
  const tagCount = entry.tags.length

  const score = clamp01(
    entry.confidence * 0.5
    + entry.weight * 0.3
    + Math.min(evidenceCount, 5) / 5 * 0.1
    + Math.min(ontologyLinkCount, 5) / 5 * 0.05
    + Math.min(tagCount, 5) / 5 * 0.05,
  )

  return Object.freeze({
    score,
    confidence: entry.confidence,
    weight: entry.weight,
    evidenceCount,
    ontologyLinkCount,
    tagCount,
  })
}
